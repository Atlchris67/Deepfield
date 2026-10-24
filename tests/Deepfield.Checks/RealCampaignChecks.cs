using System.Text.Json;
using System.Text.Json.Nodes;
using Deepfield.Api;
using Deepfield.Engine;

public static class RealCampaignChecks
{
    public static async Task Run()
    {
        var map = RealStarMap.Generate();
        if (map.RealCatalogVersion != 1 || map.RealSystems?.Count != 24 || map.RealSystems.Sum(s => s.Planets.Count) != 31)
            throw new Exception("Real catalog snapshot count/version changed.");
        if (map.Homeworlds.Any(h => h.PlanetId is null || map.RealSystems[h.SystemId].Planets.All(p => p.Id != h.PlanetId)))
            throw new Exception("A real homeworld has no cataloged planet.");
        var root = Path.Combine(Path.GetTempPath(), "deepfield-real-check-" + Guid.NewGuid().ToString("N"));
        var campaigns = new GeneratedCampaigns(Path.Combine(root, "generated-campaigns"));
        var id = Guid.NewGuid().ToString("N");
        var game = await campaigns.Start(id, map, true, 0, 0);
        if (game.MaterialsVersion != 1)
            throw new Exception("New API-created real campaign did not select the richer material rules.");
        if (JsonSerializer.Serialize(RealStarMap.Generate()) != JsonSerializer.Serialize(map))
            throw new Exception("Pinned real catalog generation changed across calls.");
        if ((await campaigns.Start(id, map, true, 0, 0)).Turn != game.Turn)
            throw new Exception("Repeated real campaign start was not idempotent.");
        var tampered = map with { Systems = map.Systems.Select((system, index) => index == 0 ? system with { Name = "Tampered" } : system).ToArray() };
        try { Rules.CreateFromMap(tampered, DateTimeOffset.UtcNow); throw new Exception("Tampered catalog snapshot was accepted."); }
        catch (RuleException) { }
        if (game.Clans[0].Name != "Aurora Federation" || game.Stars[map.Homeworlds[0].SystemId].HomePlanetId != map.Homeworlds[0].PlanetId)
            throw new Exception("Astronomy changed clan identity or homeworld assignment.");
        var view = Rules.Observe(game, 0);
        if (view.RealSystems?.Count != 24 || view.RealSystems.Any(h => !game.Clans[0].Known.Contains(h.Id) && h.Planets.Count != 0))
            throw new Exception("Unknown planet data leaked through campaign view.");
        if (view.Stars.Any(s => !s.Visible && s.MaterialYield is not null))
            throw new Exception("Hidden material yields leaked through campaign view.");
        var saved = await campaigns.Existing(id).Execute(g => g, false);
        if (saved.MaterialsVersion != 1 || JsonSerializer.Serialize(saved.GeneratedMap) != JsonSerializer.Serialize(map))
            throw new Exception("Real catalog snapshot did not survive reload.");
        var home = map.Homeworlds[0].SystemId;
        var before = game.Clans[0].Materials!.ToArray();
        var output = Materials.Production(game, game.Stars[home]);
        if (output.Sum() <= 0 || output.Count(n => n > 0) == Materials.Count)
            throw new Exception("Home planet material production is not selective.");
        var mineOrder = new Order("mine", home);
        Rules.Validate(view, [mineOrder]);
        try { Rules.Validate(view, [new Order("build", home, Ships: 30)]); throw new Exception("Material shortage was accepted."); }
        catch (RuleException) { }
        try { Rules.Validate(view, [new Order("build", home, Ships: 10), new Order("build", home, Ships: 10)]); throw new Exception("Combined material shortage was accepted."); }
        catch (RuleException) { }
        var shortageGame = Rules.CreateFromMap(map, DateTimeOffset.UtcNow, ai: false);
        shortageGame.Clans[0].Materials = [1, 0, 0, 6, 0, 0];
        var sixShips = new Order("build", home, Ships: 6);
        try { Rules.Submit(shortageGame, 0, new Submission(1, 0, "six-ships-short", [sixShips]), DateTimeOffset.UtcNow); throw new Exception("Six-ship material shortage was accepted."); }
        catch (RuleException) { }
        if (shortageGame.Clans[0].Orders.Count != 0 || shortageGame.Clans[0].Revision != 0 || shortageGame.Clans[0].Materials![0] != 1)
            throw new Exception("Rejected material order changed the saved clan plan or stock.");
        Rules.Submit(shortageGame, 0, new Submission(1, 0, "one-ship-corrected", [sixShips with { Ships = 1 }]), DateTimeOffset.UtcNow);
        if (shortageGame.Clans[0].Orders.Single().Ships != 1 || shortageGame.Clans[0].Revision != 1)
            throw new Exception("Corrected material order could not be committed.");
        game.Clans[1].Ai = false;
        Rules.Submit(game, 0, new Submission(1, 0, "real-mine", [mineOrder]), DateTimeOffset.UtcNow);
        Rules.Resolve(game, game.Deadline);
        if (game.Stars[home].Mines != 2 || game.Clans[0].Materials![0] != before[0] - 2 + Materials.Production(game, game.Stars[home])[0] +
            map.Homeworlds.Where(h => h.PlayerSlot == 0 && h.SystemId != home).Sum(h => Materials.Production(game, game.Stars[h.SystemId])[0]))
            throw new Exception("Mine order did not conserve material stock.");
        if (game.Clans[0].Materials!.Any(n => n < 0)) throw new Exception("Negative material stock.");
        var expanded = Materials.Production(game, game.Stars[home]).Sum();
        game.Stars[home].SettlementSize++;
        if (Materials.Production(game, game.Stars[home]).Sum() <= expanded)
            throw new Exception("Settlement growth did not increase planetary production.");
        game.Clans[0].Materials![0] = -1;
        try { GameCodec.Read(JsonSerializer.Serialize(game)); throw new Exception("Negative saved stock was accepted."); }
        catch (InvalidOperationException) { }
        var legacy = Rules.Create(17, DateTimeOffset.UtcNow);
        if (GameCodec.Read(JsonSerializer.Serialize(legacy)).Clans.Any(c => c.Materials is not null))
            throw new Exception("Legacy campaign unexpectedly gained material rules.");
        try { Rules.CreateFromMap(map, DateTimeOffset.UtcNow, logisticsVersion: 2); throw new Exception("Invalid logistics mode accepted."); }
        catch (RuleException) { }
        try { Rules.CreateFromMap(map, DateTimeOffset.UtcNow, industrialFocus: [3, 0]); throw new Exception("Invalid trait accepted."); }
        catch (RuleException) { }
        var localId = Guid.NewGuid().ToString("N");
        var local = await campaigns.Start(localId, map, false, 0, 0, 1, [2, -2]);
        var localHome = local.Stars[home];
        if (local.Clans[0].Materials is not null || localHome.Stockpile is not { Length: Materials.Count } || !localHome.Gate ||
            localHome.Freighters[0] != 2 || local.Clans[0].IndustrialFocus != 2 || local.Clans[1].IndustrialFocus != -2)
            throw new Exception("Local mode did not initialize home gate, freight and bounded traits.");
        var neutral = Rules.CreateFromMap(map, DateTimeOffset.UtcNow);
        if (Materials.Production(local, localHome).Sum() <= Materials.Production(neutral, neutral.Stars[home]).Sum())
            throw new Exception("Mining trait did not improve planetary output.");
        var destination = map.Links.Where(link => link.From == home || link.To == home)
            .Select(link => link.From == home ? link.To : link.From).First(system => local.Stars[system].Owner is null);
        Rules.Submit(local, 0, new Submission(1, 0, "local-colonize", [new Order("move", home, destination, 4)]), DateTimeOffset.UtcNow);
        Rules.Resolve(local, local.Deadline);
        if (local.Stars[destination].Owner != 0 || local.Stars[destination].Gate || local.Stars[destination].Stockpile is null)
            throw new Exception("New local colony did not start isolated.");
        var beforeGate = Rules.Observe(local, 0);
        if (Logistics.Access(beforeGate, destination).Count != 1 || beforeGate.Stars[destination].AccessibleMaterials!.SequenceEqual(localHome.Stockpile))
            throw new Exception("Ungated outpost gained remote material access.");
        var outpostStock = local.Stars[destination].Stockpile!.ToArray();
        Array.Clear(local.Stars[destination].Stockpile!);
        try { Rules.Validate(Rules.Observe(local, 0), [new Order("mine", destination)]); throw new Exception("Remote spending before a paired gate was accepted."); }
        catch (RuleException) { }
        local.Stars[destination].Stockpile = outpostStock;
        var cargo = new[] { 4, 0, 2, 0, 0, 2 };
        var stockBeforeTransport = localHome.Stockpile.ToArray();
        var shipCargo = new Order("transport", home, destination, 1, Cargo: cargo);
        Rules.Validate(beforeGate, [shipCargo]);
        try { Rules.Validate(beforeGate, [shipCargo with { Ships = 2, Cargo = [21, 0, 0, 0, 0, 0] }]); throw new Exception("Over-capacity freight was accepted."); }
        catch (RuleException) { }
        Rules.Submit(local, 0, new Submission(2, 0, "local-transport", [shipCargo]), DateTimeOffset.UtcNow);
        Rules.Resolve(local, local.Deadline);
        if (localHome.Freighters[0] != 1 || local.Stars[destination].Freighters[0] != 1 ||
            Enumerable.Range(0, Materials.Count).Any(i => localHome.Stockpile[i] < stockBeforeTransport[i] - cargo[i]))
            throw new Exception("Freighter transport lost or duplicated cargo.");
        var gate = new Order("gate", destination);
        Rules.Submit(local, 0, new Submission(3, 0, "local-gate", [gate]), DateTimeOffset.UtcNow);
        Rules.Resolve(local, local.Deadline);
        var withGate = Rules.Observe(local, 0);
        if (!local.Stars[destination].Gate || Logistics.Access(withGate, destination).Count < 2)
            throw new Exception("Paired gates failed to connect owned systems.");
        local.Stars[destination].Stockpile![0] = 0;
        var remoteMine = new Order("mine", destination);
        var homeFerrite = localHome.Stockpile[0];
        Rules.Submit(local, 0, new Submission(4, 0, "remote-mine", [remoteMine]), DateTimeOffset.UtcNow);
        Rules.Resolve(local, local.Deadline);
        if (local.Stars[destination].Mines != 1 || localHome.Stockpile[0] >= homeFerrite + Materials.Production(local, localHome)[0])
            throw new Exception("Gate network did not fund a remote build.");
        if (local.Stars.Where(star => star.Stockpile is not null).Any(star => star.Stockpile!.Any(amount => amount < 0)))
            throw new Exception("Local stockpile became negative.");
        if (GameCodec.Read(JsonSerializer.Serialize(local)).LogisticsVersion != 1)
            throw new Exception("Local logistics did not survive save reload.");
        CheckMaterialBalance(map);
        Console.WriteLine("PASS real catalog, planet homeworld, fog and reload");
    }

    private static void CheckMaterialBalance(GeneratedStarMap map)
    {
        var now = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var richer = Rules.CreateFromMap(map, now, ai: false);
        var original = Rules.CreateFromMap(map, now, ai: false);
        original.MaterialsVersion = 0;
        foreach (var home in map.Homeworlds)
        {
            var survey = Materials.Survey(richer, home.SystemId);
            var yield = Materials.Production(richer, richer.Stars[home.SystemId]);
            if (survey[0] == 0 || survey[3] == 0 || yield[0] < 6 || yield[3] < 6)
                throw new Exception("Home lacks sustainable Ferrite or Neralite output.");
            if (survey.Count(site => site > 0) > 3)
                throw new Exception("Home became self-sufficient in all materials.");
        }
        var onePlanetHome = map.Homeworlds.Single(h => map.RealSystems![h.SystemId].Planets.Count == 1).SystemId;
        var colony = richer.Stars[onePlanetHome];
        var first = Materials.Production(richer, colony);
        colony.Mines = 2;
        var twoMines = Materials.Production(richer, colony);
        colony.SettlementSize = 3;
        var grown = Materials.Production(richer, colony);
        if (twoMines[0] <= first[0] || grown[0] <= twoMines[0] || grown[3] <= twoMines[3] || grown.Sum() > 60)
            throw new Exception("Mine/settlement scaling stalled or grew without bound.");
        colony.Mines = 1;
        colony.SettlementSize = 2;
        var starting = richer.Clans[0].Materials!.ToArray();
        var perTurn = richer.Stars.Where(s => s.Owner == 0).Select(s => Materials.Production(richer, s)).ToArray();
        for (var turn = 0; turn < 4; turn++)
        {
            Rules.Resolve(richer, richer.Deadline);
            Rules.Resolve(original, original.Deadline);
        }
        for (var material = 0; material < Materials.Count; material++)
            if (richer.Clans[0].Materials![material] != starting[material] + 4 * perTurn.Sum(y => y[material]))
                throw new Exception("Material production did not conserve stock over four turns.");
        if (richer.Clans[0].Materials![0] <= original.Clans[0].Materials![0] ||
            richer.Clans[0].Materials![3] <= original.Clans[0].Materials![3])
            throw new Exception("New balance did not improve early construction and fuel supply.");
        foreach (var home in map.Homeworlds)
        {
            var builder = Rules.CreateFromMap(map, now, ai: false);
            builder.Clans[home.PlayerSlot].Credits = 500;
            for (var turn = 0; turn < 4; turn++)
            {
                Rules.Submit(builder, home.PlayerSlot, new Submission(builder.Turn, 0, $"six-{home.PlayerSlot}-{turn}",
                    [new Order("build", home.SystemId, Ships: 6)]), now);
                Rules.Resolve(builder, builder.Deadline);
                if (builder.Clans[home.PlayerSlot].Materials!.Any(amount => amount < 0))
                    throw new Exception("Repeated six-ship builds overdrew stock.");
            }
            if (builder.Stars[home.SystemId].Ships[home.PlayerSlot] != 32)
                throw new Exception("Six ships per turn did not complete at the starting home.");
        }
        if (GameCodec.Read(JsonSerializer.Serialize(richer)).MaterialsVersion != 1 ||
            GameCodec.Read(JsonSerializer.Serialize(original)).MaterialsVersion != 0)
            throw new Exception("Material rules version did not survive save/reload.");
        var legacySave = JsonSerializer.SerializeToNode(original)!.AsObject();
        legacySave.Remove(nameof(Game.MaterialsVersion));
        var reloadedLegacy = GameCodec.Read(legacySave.ToJsonString());
        if (reloadedLegacy.MaterialsVersion != 0 || map.Homeworlds.Any(home =>
                !Materials.Survey(reloadedLegacy, home.SystemId).SequenceEqual(Materials.Survey(original, home.SystemId)) ||
                !Materials.Production(reloadedLegacy, reloadedLegacy.Stars[home.SystemId]).SequenceEqual(
                    Materials.Production(original, original.Stars[home.SystemId]))))
            throw new Exception("A save without MaterialsVersion changed its original deposits or yields.");
        Console.WriteLine($"PASS material balance: four turns Ferrite {original.Clans[0].Materials![0]} -> {richer.Clans[0].Materials![0]}, Neralite {original.Clans[0].Materials![3]} -> {richer.Clans[0].Materials![3]}");
    }
}
