using System.Text.Json;
using Deepfield.Engine;

public static class StarMapChecks
{
    private static int count;

    private static void Assert(bool ok, string message)
    {
        if (!ok) throw new Exception(message);
        count++;
        Console.WriteLine("PASS " + message);
    }

    private static void Reject(Action action, string message)
    {
        try { action(); }
        catch (RuleException) { Assert(true, message); return; }
        throw new Exception("Expected rejection: " + message);
    }

    public static void Run()
    {
        var settings = new StarMapSettings(SystemCount: 36, Width: 1200, Height: 800,
            MinimumSeparation: 50, NearestNeighborLinks: 2, PlayerCount: 4);
        var map = StarMapGenerator.Generate(42, settings);
        var replay = StarMapGenerator.Generate(42, settings);
        var other = StarMapGenerator.Generate(43, settings);

        Assert(map.GeneratorVersion == StarMapGenerator.CurrentVersion && map.Seed == 42,
            "Generated map records seed and generator version");
        Assert(JsonSerializer.Serialize(map) == JsonSerializer.Serialize(replay),
            "Same seed and settings reproduce the exact map snapshot");
        Assert(map.Systems.Take(3).SequenceEqual(
            [
                new GeneratedSystem(0, "Hearth", 224, 733),
                new GeneratedSystem(1, "Lumen", 142, 351),
                new GeneratedSystem(2, "Vesper", 1022, 15)
            ]),
            "Version 1 seed fixture remains stable");
        Assert(JsonSerializer.Serialize(map) != JsonSerializer.Serialize(other),
            "Different seeds produce different map snapshots");
        Assert(map.Systems.Count == settings.SystemCount && map.Systems.Select(system => system.Id).SequenceEqual(Enumerable.Range(0, settings.SystemCount)),
            "Generated systems have stable contiguous identities");
        Assert(map.Systems.All(system => system.X >= 0 && system.X <= settings.Width && system.Y >= 0 && system.Y <= settings.Height),
            "Generated coordinates remain inside configured bounds");

        var minimumDistanceSquared = (long)settings.MinimumSeparation * settings.MinimumSeparation;
        Assert(map.Systems.SelectMany((left, index) => map.Systems.Skip(index + 1).Select(right => Distance(left, right)))
                .All(distance => distance >= minimumDistanceSquared),
            "Generated systems honor minimum separation");

        Assert(map.Links.Count >= settings.SystemCount - 1 && map.Links.All(link => link.From < link.To),
            "Links are normalized and include at least a spanning tree");
        Assert(map.Links.Distinct().Count() == map.Links.Count,
            "Generated links contain no duplicates");
        Assert(Reachable(map).Count == settings.SystemCount,
            "Generated link graph connects every system");

        Assert(map.Homeworlds.Count == settings.PlayerCount && map.Homeworlds.Select(home => home.PlayerSlot).SequenceEqual(Enumerable.Range(0, settings.PlayerCount)),
            "Every player slot receives one homeworld");
        Assert(map.Homeworlds.Select(home => home.SystemId).Distinct().Count() == settings.PlayerCount &&
               map.Homeworlds.All(home => map.Systems.Any(system => system.Id == home.SystemId)),
            "Homeworld assignments are unique and reference generated systems");

        var json = JsonSerializer.Serialize(map);
        var restored = JsonSerializer.Deserialize<GeneratedStarMap>(json)!;
        Assert(JsonSerializer.Serialize(restored) == json,
            "Generated map contract survives persistence round-trip");

        Reject(() => StarMapGenerator.Generate(1, settings with { SystemCount = 1 }),
            "System counts below the supported range fail closed");
        Reject(() => StarMapGenerator.Generate(1, settings with { PlayerCount = settings.SystemCount + 1 }),
            "Player counts cannot exceed generated systems");
        Reject(() => StarMapGenerator.Generate(1, new StarMapSettings(20, 100, 100, 100, 2, 2)),
            "Impossible density fails closed instead of returning a partial map");

        Console.WriteLine($"{count} star-map checks passed.");
    }

    private static long Distance(GeneratedSystem left, GeneratedSystem right)
    {
        var dx = (long)left.X - right.X;
        var dy = (long)left.Y - right.Y;
        return dx * dx + dy * dy;
    }

    private static HashSet<int> Reachable(GeneratedStarMap map)
    {
        var reached = new HashSet<int> { map.Systems[0].Id };
        var queue = new Queue<int>(reached);
        while (queue.TryDequeue(out var current))
        {
            foreach (var link in map.Links.Where(link => link.From == current || link.To == current))
            {
                var next = link.From == current ? link.To : link.From;
                if (reached.Add(next)) queue.Enqueue(next);
            }
        }
        return reached;
    }
}
