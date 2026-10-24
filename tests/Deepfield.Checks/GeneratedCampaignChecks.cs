using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

public static class GeneratedCampaignChecks
{
    public static async Task Run()
    {
        var count = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception(name);
            count++; Console.WriteLine("PASS " + name);
        }

        var root = Path.Combine(Path.GetTempPath(), "deepfield-generated-check-" + Guid.NewGuid().ToString("N"));
        var originalPath = Path.Combine(root, "campaign.json");
        var original = new FileGameStore(originalPath, () => Rules.Create(11, DateTimeOffset.UtcNow));
        await original.Execute(game => game.Turn, false);
        var originalBytes = await File.ReadAllBytesAsync(originalPath);
        var generated = new GeneratedCampaigns(Path.Combine(root, "generated-campaigns"));
        var map = StarMapGenerator.Generate(73, new StarMapSettings(17, 850, 630, 40, 2, 2));
        try { Rules.CreateFromMap(StarMapGenerator.Generate(73, new StarMapSettings(3, 850, 630, 40, 2, 2)), DateTimeOffset.UtcNow); throw new Exception("Expected unwinnable map rejection"); }
        catch (RuleException) { Check(true, "Campaign creation rejects maps too small to meet victory condition"); }
        var id = Guid.NewGuid().ToString("N");
        var game = await generated.Start(id, map, true, 0, 0);
        Check(game.Stars.Count == 17 && game.GeneratedMap is not null &&
              JsonSerializer.Serialize(game.GeneratedMap) == JsonSerializer.Serialize(map),
              "Started game persists exact preview snapshot and system count");
        Check(map.Homeworlds.All(home => game.Stars[home.SystemId].Owner == home.PlayerSlot &&
              game.Clans[home.PlayerSlot].Known.Order().SequenceEqual(map.Links
                  .Where(link => link.From == home.SystemId || link.To == home.SystemId)
                  .Select(link => link.From == home.SystemId ? link.To : link.From)
                  .Append(home.SystemId).Distinct().Order())),
              "Generated homeworlds and route visibility initialize correctly");
        var replay = await generated.Start(id, map, true, 0, 0);
        Check(replay.Turn == game.Turn && generated.ExistingStores().Count() == 1,
              "Repeated start ID returns one campaign");
        var different = StarMapGenerator.Generate(74, map.Settings);
        try { await generated.Start(id, different, true, 0, 0); throw new Exception("Expected ID conflict"); }
        catch (RuleException) { Check(true, "Reusing an ID for a different preview is rejected"); }
        var home = map.Homeworlds[0].SystemId;
        var target = map.Links.Where(link => link.From == home || link.To == home)
            .Select(link => link.From == home ? link.To : link.From)
            .First(id => game.Stars[id].Owner is null);
        Check(Rules.Linked(game, home, target) && Rules.Observe(game, 0).Stars[target].Known,
              "Generated links govern available destinations");
        var nonNeighbor = game.Stars.First(star => star.Id != home && !Rules.Linked(game, home, star.Id)).Id;
        game.Clans[0].Known.Add(nonNeighbor);
        try { Rules.Validate(Rules.Observe(game, 0), [new Order("move", home, nonNeighbor, 4)]); throw new Exception("Expected unlinked move rejection"); }
        catch (RuleException) { Check(true, "Generated campaign rejects a charted non-route destination"); }
        await generated.Existing(id).Execute(g => Rules.Submit(g, 0, new Submission(1, 0, "generated-move", [new Order("move", home, target, 4)]), DateTimeOffset.UtcNow));
        var resolved = await generated.Existing(id).Execute(g => Rules.Resolve(g, g.Deadline));
        var fromStore = await generated.Existing(id).Execute(g => g, false);
        Check(resolved && fromStore.Turn == 2 && fromStore.Stars[target].Owner == 0,
              "Generated campaign accepts a linked order and resolves a colony turn");
        var originalAfter = await File.ReadAllBytesAsync(originalPath);
        Check(originalBytes.SequenceEqual(originalAfter),
              "Starting and playing generated campaign leaves original save byte-for-byte unchanged");
        Check(GameCodec.Read(JsonSerializer.Serialize(fromStore)).GeneratedMap?.Systems.Count == 17,
              "Generated snapshot survives game save round-trip");
        Console.WriteLine($"{count} generated campaign checks passed.");
    }
}
