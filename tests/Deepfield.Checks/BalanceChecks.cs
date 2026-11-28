using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

/// <summary>Play-balance pass (owner decisions, 2026-11-28): the standard winning condition of new campaigns, and the computer's freight.</summary>
public static class BalanceChecks
{
    public static void Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-28T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }

        // The standard winning condition.
        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
        {
            var fresh = Modes.Create(RealStarMap.Generate(7), now, false, mode);
            Check(fresh.Victory == new VictoryRule(5, 12, 0) && Rules.Observe(fresh, 0) is { Goal: 12, Victory: { Colonies: 5, Collectors: 12, TurnLimit: 0 } },
                $"A new {mode} campaign is won with 5 colonies and 12 collectors");
        }
        var original = Rules.CreateFromMap(RealStarMap.Generate(7), now, false);
        Check(original.Victory is null && Rules.Victory(original) == new VictoryRule(4, 8, 0), "A campaign on the original rules keeps 4 colonies and 8 collectors");
        var saved = Modes.Create(RealStarMap.Generate(7), now, false, Modes.Simple); saved.Victory = null;
        var reopened = GameCodec.Read(JsonSerializer.Serialize(saved));
        Check(reopened.Victory is null && Rules.Victory(reopened) == new VictoryRule(4, 8, 0) && Rules.Observe(reopened, 0).Goal == 8,
            "A campaign saved before this change, with no stored condition, still needs 4 colonies and 8 collectors");
        Seasons.StartNext(reopened, 1, 11, now, endEarly: true);
        Check(Rules.Victory(reopened) == new VictoryRule(4, 8, 0) && reopened.Season == 2, "Its next season keeps that condition unless the game creator chooses another");
        var current = Modes.Create(RealStarMap.Generate(7), now, false, Modes.Advanced);
        Seasons.StartNext(current, 1, 11, now, endEarly: true); Seasons.SetMode(current, 2, Modes.Simple, now);
        Check(current.Victory == VictoryRule.Standard, "A new campaign carries 5 colonies and 12 collectors into its next season and through a mode change");
        Seasons.StartNext(current, 2, 12, now, endEarly: true, victory: new VictoryRule(4, 8, 0));
        Check(current.Victory == new VictoryRule(4, 8, 0), "The game creator can still choose 4 colonies and 8 collectors");

        // Freight: the computer brings collector materials to the colony that builds collectors.
        const int ceryth = 2, soryl = 4;
        Game Supply(int hops, out Star home, out Star source)
        {
            for (var seed = 1; ; seed++)
            {
                var g = Modes.Create(RealStarMap.Generate(seed), now, false, Modes.Advanced); g.Clans[0].Ai = true;
                // Fixed entropy: which material each planet yields must not vary from run to run.
                g.ReconEntropy = Convert.ToHexString(Enumerable.Repeat((byte)41, 32).ToArray());
                home = g.Stars.First(s => s.Owner == 0); var homeId = home.Id;
                var chain = new List<Star> { home };
                // A line of colonies leading away from home, each one jump further and none next to an earlier one.
                while (chain.Count <= hops && g.Stars.FirstOrDefault(s => s.Owner is null && Rules.Linked(g, chain[^1].Id, s.Id) && chain.Take(chain.Count - 1).All(c => !Rules.Linked(g, c.Id, s.Id))) is { } next)
                { next.Owner = 0; next.Inhabitants = 20; next.SettlementSize = 1; next.Stockpile = new int[Materials.Count]; chain.Add(next); }
                if (chain.Count <= hops) continue;
                source = chain[^1];
                home.Stockpile![ceryth] = 0; source.Stockpile![ceryth] = 30; g.Clans[0].Credits = 200;
                return g;
            }
        }
        void Turns(Game g, int turns) { for (var i = 0; i < turns; i++) Rules.Resolve(g, g.Deadline); }

        var near = Supply(1, out var hub, out var mine); var before = hub.Collectors;
        var first = Rules.PlanAi(Rules.Observe(near, 0));
        Check(first.All(o => o.Kind != "collector") && first.Count(o => o.Kind == "transport") == 1 && first.Single(o => o.Kind == "transport") is { Ships: 1 } sent && sent.Source == hub.Id && sent.Target == mine.Id && sent.Cargo!.Sum() == 1 && sent.Cargo[ceryth] == 0,
            "With no Ceryth at home the computer cannot buy a collector, and sends one freighter to the colony that has some");
        Turns(near, 1);
        var back = Rules.PlanAi(Rules.Observe(near, 0)).Where(o => o.Kind == "transport").ToList();
        Check(mine.Freighters[0] == 1 && back.Count == 1 && back[0].Source == mine.Id && back[0].Target == hub.Id && back[0].Cargo![ceryth] == 10 && back[0].Ships == 1,
            "The freighter comes back with as much Ceryth as it can carry, and no second freighter is sent after it");
        Turns(near, 3);
        Check(near.Stars.Where(s => s.Owner == 0).Sum(s => s.Collectors) > before, "The Ceryth arrives and the computer buys collectors with it");
        Turns(near, 12);
        Check(near.Stars.Where(s => s.Owner == 0).Sum(s => s.Collectors) >= 12 || near.Winner is not null, "It keeps ferrying until it has the 12 collectors the season asks for");

        var far = Supply(2, out var farHub, out var farMine);
        var between = far.Stars.Single(s => s.Owner == 0 && Rules.Linked(far, s.Id, farHub.Id) && Rules.Linked(far, s.Id, farMine.Id));
        var relayed = false;
        for (var i = 0; i < 6; i++) { relayed |= Rules.PlanAi(Rules.Observe(far, 0)).Any(o => o.Kind == "transport" && o.Source == between.Id); Turns(far, 1); }
        Check(relayed && far.Stars.Where(s => s.Owner == 0).Sum(s => s.Collectors) >= 2, "With the Ceryth two jumps from home, freighters relay through the colony between and collectors get built");

        var plenty = Supply(1, out var richHub, out _); richHub.Stockpile![ceryth] = 12; richHub.Stockpile[soryl] = 12;
        Check(Rules.PlanAi(Rules.Observe(plenty, 0)).All(o => o.Kind != "transport"), "With enough of both materials at home the computer sends no freighters");
        var simple = Modes.Create(RealStarMap.Generate(3), now, false, Modes.Simple);
        Check(Rules.PlanAi(Rules.Observe(simple, 0)).All(o => o.Kind is not ("transport" or "freighter" or "gate")), "In simple mode the computer never plans freight");

        // Whole seasons at the standard condition, every clan played by the computer.
        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
            foreach (var clans in new[] { 2, 4 })
            {
                var finished = 0; var slowest = 0; const int maps = 20;
                for (var seed = 1; seed <= maps; seed++)
                {
                    var g = Modes.Create(RealStarMap.Generate(seed + 100, clans), now, true, mode);
                    foreach (var clan in g.Clans) clan.Ai = true;
                    g.ReconEntropy = Convert.ToHexString(Enumerable.Repeat((byte)(seed + 7), 32).ToArray());
                    for (var turn = 0; turn < 120 && g.Winner is null; turn++) Rules.Resolve(g, g.Deadline);
                    if (g.Winner is not null) { finished++; slowest = Math.Max(slowest, Seasons.TurnsPlayed(g)); }
                }
                Console.WriteLine($"INFO standard condition, {mode}, {clans} clans: {finished} of {maps} seasons finished, slowest {slowest} turns");
                Check(finished >= maps - 1, $"Computer-played {mode} seasons with {clans} clans reach 5 colonies and 12 collectors on at least {maps - 1} of {maps} maps");
            }

        Console.WriteLine($"{count} balance checks passed.");
    }
}
