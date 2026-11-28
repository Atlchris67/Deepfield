using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

/// <summary>Inhabitants: they grow faster on a more habitable world and a colony's income rises with them.</summary>
public static class PopulationChecks
{
    public static void Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-27T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        bool Invalid(Game game) { try { GameCodec.Read(JsonSerializer.Serialize(game)); return false; } catch (InvalidOperationException) { return true; } }
        Game Copy(Game game) => GameCodec.Read(JsonSerializer.Serialize(game));
        Submission Orders(Game g, int team, params Order[] orders) => new(g.Turn, g.Clans[team].Revision, Guid.NewGuid().ToString("N"), [.. orders]);
        Star Home(Game g, int team) => g.Stars.First(s => s.Owner == team && s.HomePlanetId is not null);
        ColonyEnvironment kind = new(0, 0, 0), harsh = new(100, 100, 100);

        // The numbers.
        Check(Habitability.Score(kind) == 100 && Habitability.Score(harsh) == 0 && Population.Growth(0) == 3 && Population.Growth(100) == 15 &&
              Enumerable.Range(0, 100).All(score => Population.Growth(score + 1) >= Population.Growth(score)),
            "Inhabitants grow by 3 a turn on the harshest world and 15 on the kindest, and never slower on a more habitable one");
        Check(Population.Income(0) == 5 && Population.Income(Population.Founding) == 7 && Population.Income(Population.Capacity) == 15 &&
              Enumerable.Range(0, 100).All(n => Population.Income(n + 1) >= Population.Income(n)),
            "A colony earns 5 credits when empty, 7 when founded and 15 when full, and never less with more inhabitants");

        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
        {
            var g = Modes.Create(RealStarMap.Generate(21), now, false, mode);
            var collectorIncome = mode == Modes.Advanced ? 3 : 0;
            Check(g.PopulationVersion == 1 && g.Stars.All(s => s.Inhabitants == (s.Owner is null ? 0 : Population.Capacity)) &&
                  Rules.Observe(g, 0).NextIncome == 15 + collectorIncome && Rules.Observe(g, 1).NextIncome == 15 + collectorIncome,
                $"A new {mode} campaign has inhabitants: homeworlds start full, so the opening income is unchanged");

            // Each clan founds one colony; clan 0's is the kindest possible world and clan 1's the harshest.
            int[] colony = [0, 1];
            for (var team = 0; team < 2; team++)
            {
                var home = Home(g, team);
                colony[team] = g.Stars.First(s => s.Owner is null && Rules.Linked(g, home.Id, s.Id) && !Rules.Linked(g, Home(g, 1 - team).Id, s.Id)).Id;
                g.Stars[colony[team]].Environment = team == 0 ? kind : harsh;
                Rules.Submit(g, team, Orders(g, team, new Order("move", home.Id, colony[team], 3, Hull: mode == Modes.Advanced ? "interceptor" : null)), now);
            }
            var before = g.Clans.Select(c => c.Credits).ToArray();
            Rules.Resolve(g, g.Deadline);
            Star good = g.Stars[colony[0]], poor = g.Stars[colony[1]];
            Check(good.Owner == 0 && poor.Owner == 1 && g.Clans[0].Credits - before[0] == 15 + collectorIncome + 7 && g.Clans[1].Credits - before[1] == 15 + collectorIncome + 7,
                $"[{mode}] A colony is founded with {Population.Founding} inhabitants and earns 7 credits that turn, on any world");
            Check(good.Inhabitants == Population.Founding + 15 && poor.Inhabitants == Population.Founding + 3,
                $"[{mode}] After the first turn the colony on the kind world has grown by 15 and the one on the harsh world by 3");
            View mine = Rules.Observe(g, 0), theirs = Rules.Observe(g, 1);
            Check(mine.Stars[good.Id] is { Inhabitants: 35, InhabitantGrowth: 15, ColonyIncome: 8, Habitability: 100 } &&
                  theirs.Stars[poor.Id] is { Inhabitants: 23, InhabitantGrowth: 3, ColonyIncome: 7, Habitability: 0 } &&
                  mine.NextIncome == 15 + collectorIncome + 8 && theirs.NextIncome == 15 + collectorIncome + 7,
                $"[{mode}] A clan sees its own colony's inhabitants, growth, income and habitability, and the projected income counts them");
            Check(mine.Stars[poor.Id] is { Inhabitants: null, InhabitantGrowth: null, ColonyIncome: null, Habitability: null } &&
                  mine.Stars.Where(s => s.Owner is null).All(s => s.Inhabitants is null && s.Habitability is null),
                $"[{mode}] A clan is shown nothing about a colony it cannot see, and no habitability score for a system it does not hold");
            Check(!Invalid(g) && Copy(g).Stars[good.Id].Inhabitants == 35 && Copy(g).PopulationVersion == 1, $"[{mode}] Inhabitants are saved with the campaign");

            for (var turn = 0; turn < 5; turn++) Rules.Resolve(g, g.Deadline);
            Check(good.Inhabitants == Population.Capacity && poor.Inhabitants == Population.Founding + 6 * 3 &&
                  Rules.Observe(g, 0).Stars[good.Id].ColonyIncome > Rules.Observe(g, 1).Stars[poor.Id].ColonyIncome,
                $"[{mode}] After six turns the kind world is full and the harsh world has 38 inhabitants and earns less");
            for (var turn = 0; turn < 30 && g.Winner is null; turn++) Rules.Resolve(g, g.Deadline);
            Check(g.Stars.All(s => s.Inhabitants <= Population.Capacity && (s.Owner is not null || s.Inhabitants == 0)) && (g.Winner is not null || poor.Inhabitants == Population.Capacity),
                $"[{mode}] Inhabitants never pass {Population.Capacity}, and the harsh world fills too, given time");
        }

        // Losing a colony: the conqueror starts again from the founding number.
        var war = Modes.Create(RealStarMap.Generate(21), now, false, Modes.Simple);
        var prize = war.Stars.First(s => s.Owner is null && Rules.Linked(war, Home(war, 0).Id, s.Id));
        prize.Owner = 0; prize.Inhabitants = 80; prize.Ships[1] = 6;
        Rules.Resolve(war, war.Deadline);
        Check(prize.Owner == 1 && prize.Inhabitants == Population.Founding + Population.Growth(prize),
            "A colony that falls loses its inhabitants; the clan that takes it starts from the founding number");

        // Saves.
        var tooMany = Copy(war); tooMany.Stars[prize.Id].Inhabitants = 101;
        var nobody = Copy(war); nobody.Stars.First(s => s.Owner is null).Inhabitants = 5;
        var unknown = Copy(war); unknown.PopulationVersion = 2;
        Check(Invalid(tooMany) && Invalid(nobody) && Invalid(unknown), "A save with too many inhabitants, inhabitants on an unowned system or an unknown rule version is rejected");

        // Older campaigns keep flat income.
        var legacy = Rules.CreateFromMap(RealStarMap.Generate(), now, false, economyVersion: 0, combatVersion: 0, logisticsVersion: 0);
        var forged = Copy(legacy); forged.PopulationVersion = 1;
        Check(legacy.PopulationVersion == 0 && legacy.Stars.All(s => s.Inhabitants == 0) && Rules.Observe(legacy, 0).NextIncome == 15 &&
              Rules.Observe(legacy, 0).Stars.All(s => s.Inhabitants is null && s.InhabitantGrowth is null && s.Habitability is null) && Invalid(forged),
            "A campaign from before inhabitants keeps flat colony income and shows no inhabitants");
        var older = Modes.Create(RealStarMap.Generate(21), now, false, Modes.Simple); older.PopulationVersion = 0; foreach (var s in older.Stars) s.Inhabitants = 0;
        var text = JsonSerializer.Serialize(older).Replace(",\"PopulationVersion\":0", "").Replace(",\"Inhabitants\":0", "");
        var loaded = GameCodec.Read(text);
        var target = loaded.Stars.First(s => s.Owner is null && Rules.Linked(loaded, Home(loaded, 0).Id, s.Id));
        Rules.Submit(loaded, 0, Orders(loaded, 0, new Order("move", Home(loaded, 0).Id, target.Id, 3)), now);
        Rules.Resolve(loaded, loaded.Deadline);
        Check(!text.Contains("Inhabitants") && !text.Contains("PopulationVersion") && loaded.PopulationVersion == 0 && target.Owner == 0 && target.Inhabitants == 0 && Rules.Observe(loaded, 0).NextIncome == 30,
            "A simple-mode save written before inhabitants loads unchanged and still pays 15 credits per colony");
        Seasons.StartNext(loaded, 1, 31, now.AddDays(1), endEarly: true);
        Check(loaded.Season == 2 && loaded.PopulationVersion == 1 && loaded.Stars.Where(s => s.Owner is not null).All(s => s.Inhabitants == Population.Capacity),
            "Its next season starts with inhabitants");

        // The computer player uses only what its own scouts reported.
        var planned = Modes.Create(RealStarMap.Generate(21), now, false, Modes.Simple);
        var from = Home(planned, 0);
        var choices = planned.Stars.Where(s => s.Owner is null && Rules.Linked(planned, from.Id, s.Id)).OrderBy(s => s.Id).ToList();
        Intelligence Report(int star, int score) => new(Guid.NewGuid().ToString("N"), star, 1, now, "arrival", "deep", true, false, true, null, null, 0, 0, 0, HabitabilityScore: score);
        int Destination() => Ai.Plan(Rules.Observe(planned, 0)).First(o => o.Kind is "move" or "recon").Target;
        var unreported = Destination();
        planned.Clans[0].Intelligence.Add(Report(choices[0].Id, 10)); planned.Clans[0].Intelligence.Add(Report(choices[^1].Id, 90));
        var informed = Destination();
        foreach (var s in choices) s.Environment = s.Id == choices[0].Id ? kind : harsh; // The truth is the opposite of the reports, and hidden.
        Check(choices.Count >= 2 && unreported == choices[0].Id && informed == choices[^1].Id && Destination() == choices[^1].Id,
            "The computer heads for the system its scouts reported as more habitable, and cannot see a score it has no report for");

        Console.WriteLine($"{count} inhabitant checks passed.");
    }
}
