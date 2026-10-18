using System.Text.Json;
using Deepfield.Engine;

public static class PlanetChecks
{
    public static void Run()
    {
        int checks = 0;
        void Check(bool value, string name) { if (!value) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
        var now = DateTimeOffset.Parse("2026-10-18T12:00:00Z");
        var g = Rules.Create(42, now, false, 1, 1);
        g.Stars[0].Scouts[0] = 3;
        g.Stars[0].Fleets![0] = [1, 2, 3, 4, 5]; TypedCombat.Sync(g.Stars[0]);
        var own = Rules.Observe(g, 0).Stars[0];
        var stats = own.Statistics!;
        Check(stats.Knowledge == "current" && stats.Owner == 0 && stats.ColonyIncome == 18, "Own colony has current ownership and ruleset income");
        Check(stats.Fleets[0].CombatShips == 15 && stats.Fleets[0].TotalShips == 18 && stats.Fleets[0].Composition!.Sum() == 15, "Combat hull sum and total including scouts are distinct");
        Check(stats.Fleets[1].TotalShips == 0 && stats.Defense == 0, "Observed zero ships and defenses remain zero");
        var charted = Rules.Observe(g, 0).Stars[1];
        var unknown = Rules.Observe(g, 0).Stars[11];
        Check(charted.Statistics!.Knowledge == "charted" && unknown.Statistics!.Knowledge == "unknown", "Charting alone is not a survey");
        Check(unknown.Statistics!.Owner == null && unknown.Statistics.Collectors == null && unknown.Statistics.Fleets.Count == 0, "Uncharted enemy colony discloses no statistics");
        string Hidden() => JsonSerializer.Serialize(Rules.Observe(g, 0).Stars[11]);
        var before = Hidden(); g.Stars[11].Collectors = 97; g.Stars[11].Defense = 6; g.Stars[11].Scouts[1] = 81;
        g.Stars[11].Fleets![1][3] = 73; TypedCombat.Sync(g.Stars[11]);
        Check(Hidden() == before, "Hidden world mutations leave serialized planet projection unchanged");
        g.Stars[1].Owner = 1; g.Stars[1].Collectors = 4; g.Stars[1].Defense = 2; g.Stars[1].Scouts[1] = 2;
        g.Stars[1].Fleets![1] = [1, 2, 0, 0, 0]; TypedCombat.Sync(g.Stars[1]);
        g.ReconRates = new(100, 100, 100);
        Rules.Submit(g, 0, new(1, 0, "planet-deep", [new("recon", 0, 1, 1, "deep")]), now);
        Rules.Resolve(g, g.Deadline);
        var deep = Rules.Observe(g, 0).Stars[1]; stats = deep.Statistics!;
        Check(stats.Knowledge == "historical" && stats.Turn == 1 && stats.At.HasValue && stats.Phase == "arrival / before combat", "Real deep mission produces a dated historical snapshot");
        Check(!deep.Visible && stats.Collectors == 4 && stats.Defense == 2 && stats.Fleets.Single().TotalShips == 5, "Deep survey reveals only observed counts and composition");
        Check(stats.ColonyIncome == null && stats.Fleets.Single().Team == 1, "Enemy snapshot has no own-fleet invention or current income");
        var serialized = JsonSerializer.Serialize(stats); g.Stars[1].Collectors = 99; g.Stars[1].Scouts[1] = 77;
        Check(JsonSerializer.Serialize(Rules.Observe(g, 0).Stars[1].Statistics) == serialized, "Dated observation cannot track hidden changes");
        Check(Rules.Observe(g, 1).Stars[1].Statistics!.Knowledge == "current" && Rules.Observe(g, 1).Intelligence!.Count == 0, "Other clan gets its current colony and no private scout report");
        var report = g.Clans[0].Intelligence.Single();
        g.Clans[0].Intelligence.Insert(0, report with { Id = "limited", Turn = 2, Mission = "close", Returned = false, OwnerObserved = false, Owner = null, EnemyShips = null, EnemyScouts = null, EnemyComposition = null, Collectors = null, Defense = null, FleetBand = null });
        var lost = Rules.Observe(g, 0).Stars[1];
        Check(!lost.Statistics!.OwnerObserved && lost.Statistics.Collectors == null && lost.Statistics.Fleets[0].TotalShips == null, "Latest failed mission does not borrow older exact measurements");
        g.Clans[0].Intelligence[0] = report with { Id = "close", Turn = 2, Mission = "close", EnemyShips = null, EnemyScouts = null, EnemyComposition = null, Collectors = null, Defense = null, FleetBand = "1-4" };
        var close = Rules.Observe(g, 0).Stars[1];
        Check(close.Statistics!.FleetBand == "1-4" && close.Statistics.Fleets[0].CombatShips == null, "Close survey keeps fleet range without invented exact total");
        g.Clans[0].Intelligence[0] = report with { Id = "distant", Turn = 2, Mission = "distant", EnemyShips = null, EnemyScouts = null, EnemyComposition = null, Collectors = null, Defense = null, FleetBand = null };
        var distant = Rules.Observe(g, 0).Stars[1];
        Check(distant.Statistics!.OwnerObserved && distant.Statistics.Fleets[0].TotalShips == null, "Distant survey knows ownership but not ship counts");
        g.Clans[0].Intelligence[0] = report with { Id = "battle", Turn = 2, Mission = "battle", EnemyScouts = null, Collectors = null, Defense = null };
        var battle = Rules.Observe(g, 0).Stars[1];
        Check(battle.Statistics!.Fleets[0].CombatShips == 3 && battle.Statistics.Fleets[0].TotalShips == null, "Battle combat count does not imply known scout total");
        var reopened = GameCodec.Read(JsonSerializer.Serialize(g));
        Check(JsonSerializer.Serialize(Rules.Observe(reopened, 0).Stars[1].Statistics) == JsonSerializer.Serialize(battle.Statistics), "Dossier survives serialization/reopening without new state");
        var classic = Rules.Observe(Rules.Create(42, now, false), 0).Stars[0];
        Check(classic.Statistics!.ColonyIncome == 15 && classic.Statistics.Fleets[0].Composition == null, "Classic campaigns have generic ships and classic income");
        var output = Environment.GetEnvironmentVariable("DEEPFIELD_PLANET_FIXTURES");
        if (!string.IsNullOrEmpty(output)) File.WriteAllText(output, JsonSerializer.Serialize(new { own, charted, unknown, deep, lost, close, distant, battle, classic }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        Console.WriteLine($"{checks} planet statistics checks passed.");
    }
}
