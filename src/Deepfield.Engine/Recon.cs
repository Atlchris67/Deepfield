using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Deepfield.Engine;

public record ReconRates(int Distant = 90, int Close = 65, int Deep = 35)
{
    // The constructor defaults are the original 90/65/35 odds, so a save that predates stored rates keeps them.
    // Campaigns created from now on start with a guaranteed distant return; existing saves keep their stored rates.
    public static ReconRates NewCampaign => new(Distant: 100);
    public int Chance(string mission) => mission switch { "distant" => Distant, "close" => Close, "deep" => Deep, _ => 0 };
}
public record Intelligence(string Id, int Star, int Turn, DateTimeOffset At, string Phase, string Mission,
    bool Returned, bool? EnemyPresent, bool OwnerObserved, int? Owner, string? FleetBand, int? EnemyShips,
    int? EnemyScouts, int? Collectors, int? Defense = null, int[]? EnemyComposition = null,
    int[]? MaterialSurvey = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? HabitabilityScore = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] HabitabilityFactors? HabitabilityFactors = null);

public static class GameCodec
{
    public static bool NeedsEntropyMigration(string json)
    {
        using var document=JsonDocument.Parse(json);
        return !document.RootElement.TryGetProperty("ReconEntropy",out var value)||value.ValueKind==JsonValueKind.Null;
    }
    public static Game Read(string json)
    {
        var game = JsonSerializer.Deserialize<Game>(json) ?? throw new InvalidOperationException("Invalid campaign.");
        if (game.Schema is not (1 or 2 or 3 or 4)) throw new InvalidOperationException("Unsupported save schema.");
        if (game.EconomyVersion is not (0 or 1)) throw new InvalidOperationException("Unsupported economy ruleset.");
        if (game.CombatVersion is not (0 or 1)) throw new InvalidOperationException("Unsupported combat ruleset.");
        if (game.LogisticsVersion is not (0 or 1) || (game.LogisticsVersion == 1 && game.GeneratedMap?.RealCatalogVersion is null) ||
            game.MaterialsVersion is not (0 or 1) || (game.MaterialsVersion == 1 && game.GeneratedMap?.RealCatalogVersion is null) ||
            game.Clans.Any(c => c.IndustrialFocus is < -2 or > 2 || c.ShipDesigns is not { Length: 5 } ||
                c.ShipDesigns.Any(package => !ShipDesign.Packages.Contains(package))))
            throw new InvalidOperationException("Invalid campaign rules options.");
        if (game.Mode is not (null or Modes.Simple or Modes.Advanced) || (game.Mode is not null && game.GeneratedMap?.RealCatalogVersion is null) ||
            (game.Mode == Modes.Advanced && (game.EconomyVersion, game.CombatVersion, game.LogisticsVersion) != (1, 1, 1)) ||
            (game.Mode == Modes.Simple && ((game.EconomyVersion, game.CombatVersion, game.LogisticsVersion) != (0, 0, 0) ||
                game.Clans.Any(c => c.Materials is not null || c.IndustrialFocus != 0))))
            throw new InvalidOperationException("Invalid campaign mode.");
        if (game.GeneratedMap?.RealCatalogVersion is not null && (game.GeneratedMap.RealCatalogVersion != RealStarMap.Version ||
            game.GeneratedMap.RealSystems is null ||
            (game.LogisticsVersion == 0 && game.Mode != Modes.Simple && game.Clans.Any(c => c.Materials is not { Length: Materials.Count } || c.Materials.Any(n => n < 0))) ||
            (game.LogisticsVersion == 1 && (game.Clans.Any(c => c.Materials is not null) ||
                game.Stars.Any(s => s.Stockpile is not null && (s.Stockpile.Length != Materials.Count || s.Stockpile.Any(n => n < 0)) ||
                    s.Owner is not null && s.Stockpile is null || s.Freighters is not { Length: 2 } || s.Freighters.Any(n => n < 0)))) ||
            game.Stars.Any(s => s.Mines is < 0 or > 4 || s.SettlementSize is < 0 or > 4)))
            throw new InvalidOperationException("Invalid real-system material save.");
        if(game.CombatVersion==1)
        {
            if(game.Stars.Any(s=>s.Fleets==null||s.Fleets.Length!=2||s.Fleets.Any(f=>f.Length!=5||f.Any(n=>n<0||n>10000))))throw new InvalidOperationException("Invalid typed fleet save.");
            if(Enumerable.Range(0,2).Any(t=>Enumerable.Range(0,5).Any(h=>game.Stars.Sum(s=>(long)s.Fleets![t][h])>10000)))throw new InvalidOperationException("Typed fleet capacity exceeded.");
            foreach(var star in game.Stars)TypedCombat.Sync(star);
        }
        game.ReconEntropy ??= Recon.NewEntropy();
        Recon.ValidateEntropy(game.ReconEntropy);
        // Additive migration: existing ships, pending orders, serialized receipt payloads,
        // deadlines and history are retained. No observations are invented retrospectively.
        game.Schema = 4;
        return game;
    }
}

public static class Recon
{
    public static string NewEntropy()=>Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public static void ValidateEntropy(string value)
    {
        if(value.Length!=64||!value.All(Uri.IsHexDigit))throw new InvalidOperationException("Invalid private reconnaissance entropy.");
    }
    public static bool ValidMission(string? mission) => mission is "distant" or "close" or "deep";
    public static string Band(int count) => count switch { 0 => "0", <= 4 => "1–4", <= 9 => "5–9", _ => "10+" };
    public static int Roll(Game g, int team, Order order, int occurrence)
    {
        var key = FormattableString.Invariant($"recon-v2|{g.Seed}|{g.Turn}|{team}|{order.Source}|{order.Target}|{order.Mission}|{occurrence}");
        var entropy=g.ReconEntropy??throw new InvalidOperationException("Campaign entropy must be migrated and persisted before reconnaissance.");
        return (int)(BinaryPrimitives.ReadUInt32LittleEndian(HMACSHA256.HashData(Convert.FromHexString(entropy),Encoding.UTF8.GetBytes(key))) % 100);
    }
    public static void Resolve(Game g, DateTimeOffset at)
    {
        // Snapshot avoids team iteration order changing intelligence about scout losses.
        var snapshot = g.Stars.Select(s => new { s.Owner, s.Collectors, s.Defense, Ships = s.Ships.ToArray(), Scouts = s.Scouts.ToArray(), Fleets=s.Fleets?.Select(f=>f.ToArray()).ToArray() }).ToArray();
        for (var team = 0; team < g.Clans.Count; team++)
        {
            var occurrences = new Dictionary<(int,int,string),int>();
            foreach (var order in g.Clans[team].Orders.Where(o => o.Kind == "recon"))
            {
                var mission = order.Mission!; var key = (order.Source,order.Target,mission);
                var ordinal = occurrences.GetValueOrDefault(key); occurrences[key] = ordinal + 1;
                var returned = Roll(g,team,order,ordinal) < g.ReconRates.Chance(mission);
                if (!returned) g.Stars[order.Source].Scouts[team]--;
                var target = snapshot[order.Target]; var enemy = 1 - team;
                var present = target.Ships[enemy] > 0 || target.Scouts[enemy] > 0 || target.Owner == enemy;
                var environment = returned && mission == "deep" ? g.Stars[order.Target].Environment : null;
                var intel = new Intelligence($"{g.Turn}:{team}:{order.Source}:{order.Target}:{mission}:{ordinal}",order.Target,g.Turn,at,
                    "arrival / before combat",mission,returned,returned ? present : present ? true : null,
                    returned,returned ? target.Owner : null,
                    returned && mission is "close" or "deep" ? Band(target.Ships[enemy]) : null,
                    returned && mission == "deep" ? target.Ships[enemy] : null,
                    returned && mission == "deep" ? target.Scouts[enemy] : null,
                    returned && mission == "deep" ? target.Collectors : null,
                    returned && mission == "deep" ? target.Defense : null,
                    returned && mission == "deep" ? target.Fleets?[enemy].ToArray() : null,
                    returned && mission == "deep" && g.GeneratedMap?.RealCatalogVersion is not null
                        ? Materials.Survey(g, order.Target) : null,
                    environment is not null
                        ? Habitability.Score(environment) : null,
                    environment is null ? null : new(environment.ThermalStress, environment.GravityStress, environment.RadiationStress));
                g.Clans[team].Intelligence.Insert(0,intel);
                g.Clans[team].Reports.Insert(0,$"Turn {g.Turn}: {mission} scout at {g.Stars[order.Target].Name}: " +
                    (returned ? "returned with a dated intelligence report." : "lost; only limited contact information received."));
                if (!g.Clans[team].Known.Contains(order.Target)) g.Clans[team].Known.Add(order.Target);
            }
            g.Clans[team].Intelligence = g.Clans[team].Intelligence.Take(200).ToList();
        }
    }
}
