using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Deepfield.Engine;

public record ReconRates(int Distant = 90, int Close = 65, int Deep = 35)
{
    public int Chance(string mission) => mission switch { "distant" => Distant, "close" => Close, "deep" => Deep, _ => 0 };
}
public record Intelligence(string Id, int Star, int Turn, DateTimeOffset At, string Phase, string Mission,
    bool Returned, bool? EnemyPresent, bool OwnerObserved, int? Owner, string? FleetBand, int? EnemyShips,
    int? EnemyScouts, int? Collectors, int? Defense = null);

public static class GameCodec
{
    public static Game Read(string json)
    {
        var game = JsonSerializer.Deserialize<Game>(json) ?? throw new InvalidOperationException("Invalid campaign.");
        if (game.Schema is not (1 or 2 or 3)) throw new InvalidOperationException("Unsupported save schema.");
        if (game.EconomyVersion is not (0 or 1)) throw new InvalidOperationException("Unsupported economy ruleset.");
        // Additive migration: existing ships, pending orders, serialized receipt payloads,
        // deadlines and history are retained. No observations are invented retrospectively.
        game.Schema = 3;
        return game;
    }
}

public static class Recon
{
    public static bool ValidMission(string? mission) => mission is "distant" or "close" or "deep";
    public static string Band(int count) => count switch { 0 => "0", <= 4 => "1–4", <= 9 => "5–9", _ => "10+" };
    public static int Roll(Game g, int team, Order order, int occurrence)
    {
        var key = FormattableString.Invariant($"recon-v1|{g.Seed}|{g.Turn}|{team}|{order.Source}|{order.Target}|{order.Mission}|{occurrence}");
        return (int)(BinaryPrimitives.ReadUInt32LittleEndian(SHA256.HashData(Encoding.UTF8.GetBytes(key))) % 100);
    }
    public static void Resolve(Game g, DateTimeOffset at)
    {
        // Snapshot avoids team iteration order changing intelligence about scout losses.
        var snapshot = g.Stars.Select(s => new { s.Owner, s.Collectors, s.Defense, Ships = s.Ships.ToArray(), Scouts = s.Scouts.ToArray() }).ToArray();
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
                var intel = new Intelligence($"{g.Turn}:{team}:{order.Source}:{order.Target}:{mission}:{ordinal}",order.Target,g.Turn,at,
                    "arrival / before combat",mission,returned,returned ? present : present ? true : null,
                    returned,returned ? target.Owner : null,
                    returned && mission is "close" or "deep" ? Band(target.Ships[enemy]) : null,
                    returned && mission == "deep" ? target.Ships[enemy] : null,
                    returned && mission == "deep" ? target.Scouts[enemy] : null,
                    returned && mission == "deep" ? target.Collectors : null,
                    returned && mission == "deep" ? target.Defense : null);
                g.Clans[team].Intelligence.Insert(0,intel);
                g.Clans[team].Reports.Insert(0,$"Turn {g.Turn}: {mission} scout at {g.Stars[order.Target].Name}: " +
                    (returned ? "returned with a dated intelligence report." : "lost; only limited contact information received."));
                if (!g.Clans[team].Known.Contains(order.Target)) g.Clans[team].Known.Add(order.Target);
            }
            g.Clans[team].Intelligence = g.Clans[team].Intelligence.Take(200).ToList();
        }
    }
}
