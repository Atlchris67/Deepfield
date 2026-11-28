using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

public static class ModeChecks
{
    public static void Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-26T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        bool Refused(Action action) { try { action(); return false; } catch (RuleException) { return true; } }
        bool Invalid(Game game) { try { GameCodec.Read(JsonSerializer.Serialize(game)); return false; } catch (InvalidOperationException) { return true; } }
        Game Copy(Game game) => GameCodec.Read(JsonSerializer.Serialize(game));
        Submission Orders(Game g, params Order[] orders) => new(g.Turn, 0, Guid.NewGuid().ToString("N"), [.. orders]);
        Star Home(Game g, int team) => g.Stars.First(s => s.Owner == team);
        int Neighbour(Game g, int team) => g.Stars.First(s => s.Owner is null && Rules.Linked(g, Home(g, team).Id, s.Id)).Id;

        // Simple mode.
        var simple = Modes.Create(RealStarMap.Generate(21), now, false, Modes.Simple);
        var view = Rules.Observe(simple, 0);
        Check(simple.Mode == "simple" && (simple.EconomyVersion, simple.CombatVersion, simple.LogisticsVersion) == (0, 0, 0) && view.Mode == "simple" && view.RealCatalogVersion is not null && view.Stars.Count == 24,
            "Simple mode is played on the real-star map with the basic economy, generic ships and no logistics");
        Check(simple.Clans.All(c => c.Materials is null && c.IndustrialFocus == 0) && view.Materials is null && view.Stars.All(s => s.MaterialYield is null && s.Stockpile is null && s.Fleets is null) && simple.Stars.All(s => s.Mines == 0 && s.Stockpile is null),
            "Simple mode has no material stock, mines, stockpiles or typed fleets");
        Check(view.NextIncome == 15 && view.Credits == 60 && Home(simple, 0).Ships[0] == 8 && Home(simple, 0).Environment is not null, "Simple mode starts with 15 credits of colony income, eight ships and a habitability profile");
        var home = Home(simple, 0).Id; var target = Neighbour(simple, 0);
        Check(new[] { new Order("defense", home), new Order("mine", home), new Order("settlement", home), new Order("gate", home), new Order("freighter", home, Ships: 1), new Order("build", home, Ships: 1, Hull: "interceptor"), new Order("refit", home, Hull: "interceptor", Package: ShipDesign.Packages[1]) }
                .All(order => Refused(() => Rules.Submit(simple, 0, Orders(simple, order), now))),
            "Simple mode refuses defenses, mines, settlement growth, gates, freighters, hull classes and ship design");
        Rules.Submit(simple, 0, Orders(simple, new Order("build", home, Ships: 4), new Order("collector", home), new Order("scoutbuild", home, Ships: 2), new Order("move", home, target, 3)), now);
        Rules.Resolve(simple, simple.Deadline);
        Console.WriteLine($"INFO simple turn: owner {simple.Stars[target].Owner}, credits {simple.Clans[0].Credits}, ships {simple.Stars[home].Ships[0]}, collectors {simple.Stars[home].Collectors}, scouts {simple.Stars[home].Scouts[0]}");
        Check(simple.Stars[target].Owner == 0 && simple.Clans[0].Credits == 60 - 20 - 30 - 6 + 15 + Population.Income(Population.Founding) && simple.Stars[home].Ships[0] == 9 && simple.Stars[home].Collectors == 2 && simple.Stars[home].Scouts[0] == 2,
            "Simple mode builds ships, collectors and scouts for credits alone, and two surviving ships found a colony");
        Check(Rules.Observe(simple, 0).NextIncome == 15 + Population.Income(simple.Stars[target].Inhabitants) && Copy(simple).Mode == "simple", "Simple mode income is 15 credits for the full homeworld plus the new colony's share, and the mode is saved with the campaign");
        var robots = Modes.Create(RealStarMap.Generate(22), now, true, Modes.Simple); robots.Clans[0].Ai = true;
        for (var i = 0; i < 25 && robots.Winner is null; i++) Rules.Resolve(robots, robots.Deadline);
        Check(robots.Turn > 5 && robots.Stars.Count(s => s.Owner is not null) > 2 && !Invalid(robots), "Computer-played clans can play simple mode and leave a valid save");

        // Advanced mode.
        var advanced = Modes.Create(RealStarMap.Generate(21), now, false, Modes.Advanced, [1, -1]);
        var deep = Rules.Observe(advanced, 0); var base0 = Home(advanced, 0);
        Check(advanced.Mode == "advanced" && (advanced.EconomyVersion, advanced.CombatVersion, advanced.LogisticsVersion, advanced.MaterialsVersion) == (1, 1, 1, 1) && deep.Mode == "advanced",
            "Advanced mode turns on the tapered economy, typed fleets, logistics and materials together");
        Check(base0.Fleets is not null && base0.Stockpile is not null && base0.Gate && base0.Mines == 1 && deep.NextIncome == 18 && deep.ShipDesigns is { Length: 5 } && deep.IndustrialFocus == 1 && Rules.Observe(advanced, 1).IndustrialFocus == -1,
            "Advanced mode starts with typed fleets, a local stockpile, a gate, a mine, collector income and each clan's industrial focus");
        Rules.Submit(advanced, 0, Orders(advanced, new Order("defense", base0.Id), new Order("mine", base0.Id), new Order("build", base0.Id, Ships: 1, Hull: "interceptor")), now);
        Rules.Resolve(advanced, advanced.Deadline);
        Check(base0.Defense == 2 && base0.Mines == 2 && Copy(advanced).Mode == "advanced", "Advanced mode accepts defenses, mines and hull classes, and the mode is saved with the campaign");

        // Choosing and validating.
        Check(Refused(() => Modes.Create(RealStarMap.Generate(3), now, false, "expert")) && Refused(() => Modes.Create(RealStarMap.Generate(3), now, false, "")) &&
              Refused(() => Modes.Create(StarMapGenerator.Generate(7, new(24, 1000, 700, 1, 2, 2)), now, false, Modes.Simple)) && Refused(() => Modes.Create(RealStarMap.Generate(3), now, false, Modes.Simple, [1, 0])),
            "An unknown mode, a mode on the original fictional map, or industrial focus in simple mode is refused");
        var forged = Copy(simple); forged.Mode = "advanced"; var stocked = Copy(simple); stocked.Clans[0].Materials = Materials.StartingStock(); var unknown = Copy(simple); unknown.Mode = "expert";
        Check(Invalid(forged) && Invalid(stocked) && Invalid(unknown), "A save whose mode does not match its rules is rejected");
        var legacy = Rules.CreateFromMap(RealStarMap.Generate(), now, false, economyVersion: 0, combatVersion: 1, logisticsVersion: 1);
        Check(legacy.Mode is null && Rules.Observe(legacy, 0).Mode is null && Copy(legacy).Mode is null && Copy(Rules.Create(42017, now, false)).Mode is null, "A campaign from before modes has no mode and loads unchanged");

        // Seasons.
        var later = now.AddDays(30);
        Seasons.StartNext(legacy, 1, 31, later, endEarly: true);
        Check(legacy.Mode is null && (legacy.EconomyVersion, legacy.CombatVersion, legacy.LogisticsVersion) == (0, 1, 1), "A campaign from before modes keeps its saved rules into the next season unless a mode is chosen");
        Seasons.StartNext(legacy, 2, 32, later, endEarly: true, mode: Modes.Simple);
        Check(legacy.Mode == "simple" && legacy.Season == 3 && legacy.Clans.All(c => c.Materials is null) && legacy.Clans[0].Reports[0].Contains("simple mode"), "The game creator can move an older campaign to a mode when starting a season");
        Check(Refused(() => Seasons.StartNext(legacy, 3, 33, later, endEarly: true, mode: "expert")) && legacy.Season == 3, "An unknown mode does not start a season");
        Seasons.StartNext(advanced, 1, 34, later, endEarly: true);
        Check(advanced.Mode == "advanced" && advanced.Season == 2 && advanced.Clans[0].IndustrialFocus == 1 && advanced.Clans[1].IndustrialFocus == -1 && Home(advanced, 0).Defense == 0,
            "The next season keeps the mode and each clan's industrial focus, and starts fresh");
        Seasons.StartNext(advanced, 2, 35, later, endEarly: true, mode: Modes.Simple);
        Check(advanced.Mode == "simple" && advanced.Clans.All(c => c.IndustrialFocus == 0) && !Invalid(advanced), "Switching to simple mode for a new season drops industrial focus");
        Seasons.StartNext(advanced, 3, 36, later, endEarly: true, mode: Modes.Advanced, industrialFocus: [2, 0]);
        Check(advanced.Mode == "advanced" && advanced.Clans[0].IndustrialFocus == 2 && Home(advanced, 0).Fleets is not null && !Invalid(advanced), "Switching to advanced mode for a new season sets up typed fleets and stockpiles");

        // Changing the mode before the first turn.
        var setup = Modes.Create(RealStarMap.Generate(40), now, false, Modes.Simple);
        setup.Victory = new(3, 6, 20); setup.Season = 4; setup.History.Add(new(3, 1, 9, now, now, [], 5)); setup.Clans[1].Messages.Add(new("m", "Sam", "hello", now)); setup.Clans[1].Ai = true;
        Rules.Submit(setup, 0, Orders(setup, new Order("build", Home(setup, 0).Id, Ships: 2)), now);
        var deadline = setup.Deadline; var mapBefore = JsonSerializer.Serialize(setup.GeneratedMap);
        Check(Refused(() => Seasons.SetMode(setup, 3, Modes.Advanced, later)) && Refused(() => Seasons.SetMode(setup, 4, "expert", later)) && setup.Mode == "simple", "A mode change must name the current season and a known mode");
        Seasons.SetMode(setup, 4, Modes.Advanced, later);
        Check(setup.Mode == "advanced" && setup.Turn == 1 && setup.Deadline == deadline && JsonSerializer.Serialize(setup.GeneratedMap) == mapBefore && Home(setup, 0).Fleets is not null && Home(setup, 0).Stockpile is not null && !Invalid(setup),
            "Before the first turn the game creator can change the mode: same map and deadline, set up again under the new rules");
        Check(setup.Season == 4 && setup.Started == now && setup.Victory == new VictoryRule(3, 6, 20) && setup.History.Count == 1 && setup.Clans[1].Messages.Count == 1 && setup.Clans[1].Ai && setup.Clans[0].Orders.Count == 0 && setup.Clans[0].Reports[0].Contains("advanced mode"),
            "A mode change keeps the season, winning condition, history, clan channels and AI seats, and clears submitted orders with a report");
        Rules.Resolve(setup, setup.Deadline);
        Check(Refused(() => Seasons.SetMode(setup, 4, Modes.Simple, later)) && setup.Mode == "advanced", "The mode is fixed once the first turn has resolved");
        Check(Refused(() => Seasons.SetMode(Rules.Create(42017, now, false), 1, Modes.Simple, later)), "A campaign on the original fictional map can only take a mode when its next season starts");
        Console.WriteLine($"{count} mode checks passed.");
    }
}
