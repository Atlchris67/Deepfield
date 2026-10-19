namespace Deepfield.Engine;

/// <summary>
/// Inputs that are safe to expose in a future campaign-creation screen.
/// Changing their meaning requires a new <see cref="StarMapGenerator.CurrentVersion"/>.
/// </summary>
public sealed record StarMapSettings(
    int SystemCount = 24,
    int Width = 1000,
    int Height = 700,
    int MinimumSeparation = 45,
    int NearestNeighborLinks = 2,
    int PlayerCount = 2);

public sealed record GeneratedSystem(int Id, string Name, int X, int Y);
public sealed record StarMapLink(int From, int To);
public sealed record HomeworldAssignment(int PlayerSlot, int SystemId);

/// <summary>
/// Persist this complete snapshot with a campaign. Seed and version are provenance,
/// not an instruction to regenerate an existing campaign during load.
/// </summary>
public sealed record GeneratedStarMap(
    int GeneratorVersion,
    int Seed,
    StarMapSettings Settings,
    IReadOnlyList<GeneratedSystem> Systems,
    IReadOnlyList<StarMapLink> Links,
    IReadOnlyList<HomeworldAssignment> Homeworlds);

public static class StarMapGenerator
{
    public const int CurrentVersion = 1;

    private static readonly string[] Names =
    [
        "Hearth", "Lumen", "Vesper", "Sable", "Meridian", "Halo",
        "Cinder", "Aster", "Drift", "Orison", "Cairn", "Dawn",
        "Solace", "Rook", "Kepler", "Nadir", "Zenith", "Peregrine",
        "Ember", "Vale", "Morrow", "Echo", "Bastion", "Lyric"
    ];

    public static GeneratedStarMap Generate(int seed, StarMapSettings? settings = null)
    {
        settings ??= new StarMapSettings();
        Validate(settings);

        var systems = PlaceSystems(seed, settings);
        var links = BuildLinks(systems, settings.NearestNeighborLinks);
        var homeworlds = AssignHomeworlds(systems, settings.PlayerCount);

        return new GeneratedStarMap(CurrentVersion, seed, settings, systems, links, homeworlds);
    }

    private static void Validate(StarMapSettings settings)
    {
        if (settings.SystemCount is < 2 or > 256)
            throw new RuleException("Star map system count must be between 2 and 256.");
        if (settings.Width is < 100 or > 100_000 || settings.Height is < 100 or > 100_000)
            throw new RuleException("Star map dimensions must be between 100 and 100,000 units.");
        if (settings.MinimumSeparation < 1 || settings.MinimumSeparation > Math.Min(settings.Width, settings.Height))
            throw new RuleException("Star map minimum separation must fit inside both dimensions.");
        if (settings.NearestNeighborLinks is < 1 or > 8)
            throw new RuleException("Nearest-neighbor links must be between 1 and 8 per system.");
        if (settings.PlayerCount < 1 || settings.PlayerCount > 16 || settings.PlayerCount > settings.SystemCount)
            throw new RuleException("Player count must be between 1 and 16 and cannot exceed the system count.");
    }

    private static IReadOnlyList<GeneratedSystem> PlaceSystems(int seed, StarMapSettings settings)
    {
        var sequence = new StableSequence(seed);
        var systems = new List<GeneratedSystem>(settings.SystemCount);
        var minimumDistanceSquared = (long)settings.MinimumSeparation * settings.MinimumSeparation;
        var attemptLimit = settings.SystemCount * 20_000;

        for (var attempt = 0; systems.Count < settings.SystemCount && attempt < attemptLimit; attempt++)
        {
            var x = sequence.Next(settings.Width + 1);
            var y = sequence.Next(settings.Height + 1);
            if (systems.Any(system => DistanceSquared(system.X, system.Y, x, y) < minimumDistanceSquared))
                continue;

            var id = systems.Count;
            systems.Add(new GeneratedSystem(id, Name(id), x, y));
        }

        if (systems.Count != settings.SystemCount)
            throw new RuleException("The requested star map is too dense for its dimensions and minimum separation.");

        return systems;
    }

    private static IReadOnlyList<StarMapLink> BuildLinks(IReadOnlyList<GeneratedSystem> systems, int nearestNeighborLinks)
    {
        var links = new HashSet<(int From, int To)>();
        var connected = new HashSet<int> { systems[0].Id };

        // A deterministic minimum spanning tree guarantees that every generated
        // system is reachable before optional local links are added.
        while (connected.Count < systems.Count)
        {
            (long Distance, int From, int To)? best = null;
            foreach (var from in connected.Order())
            foreach (var to in systems.Where(system => !connected.Contains(system.Id)).Select(system => system.Id))
            {
                var candidate = (Distance(systems[from], systems[to]), from, to);
                if (best is null || ComesBefore(candidate, best.Value)) best = candidate;
            }

            var edge = best ?? throw new RuleException("Unable to connect generated star map.");
            AddLink(links, edge.From, edge.To);
            connected.Add(edge.To);
        }

        foreach (var system in systems)
        foreach (var neighbor in systems
                     .Where(candidate => candidate.Id != system.Id)
                     .OrderBy(candidate => Distance(system, candidate))
                     .ThenBy(candidate => candidate.Id)
                     .Take(nearestNeighborLinks))
            AddLink(links, system.Id, neighbor.Id);

        return links
            .OrderBy(link => link.From)
            .ThenBy(link => link.To)
            .Select(link => new StarMapLink(link.From, link.To))
            .ToList();
    }

    private static IReadOnlyList<HomeworldAssignment> AssignHomeworlds(IReadOnlyList<GeneratedSystem> systems, int playerCount)
    {
        var selected = new List<int> { systems[0].Id };
        while (selected.Count < playerCount)
        {
            var next = systems
                .Where(system => !selected.Contains(system.Id))
                .Select(system => new
                {
                    system.Id,
                    MinimumDistance = selected.Min(id => Distance(system, systems[id]))
                })
                .OrderByDescending(candidate => candidate.MinimumDistance)
                .ThenBy(candidate => candidate.Id)
                .First();
            selected.Add(next.Id);
        }

        return selected.Select((systemId, playerSlot) => new HomeworldAssignment(playerSlot, systemId)).ToList();
    }

    private static string Name(int id) => id < Names.Length ? Names[id] : $"Deepfield {id + 1:000}";

    private static long Distance(GeneratedSystem a, GeneratedSystem b) => DistanceSquared(a.X, a.Y, b.X, b.Y);

    private static long DistanceSquared(int ax, int ay, int bx, int by)
    {
        var dx = (long)ax - bx;
        var dy = (long)ay - by;
        return dx * dx + dy * dy;
    }

    private static void AddLink(HashSet<(int From, int To)> links, int a, int b)
    {
        if (a == b) return;
        links.Add(a < b ? (a, b) : (b, a));
    }

    private static bool ComesBefore(
        (long Distance, int From, int To) candidate,
        (long Distance, int From, int To) current) =>
        candidate.Distance < current.Distance ||
        candidate.Distance == current.Distance && candidate.From < current.From ||
        candidate.Distance == current.Distance && candidate.From == current.From && candidate.To < current.To;

    /// <summary>
    /// SplitMix64 keeps map generation stable across .NET runtime Random changes.
    /// </summary>
    private sealed class StableSequence(int seed)
    {
        private ulong state = unchecked((uint)seed) ^ 0xD1B54A32D192ED03UL;

        public int Next(int exclusiveMaximum)
        {
            unchecked
            {
                state += 0x9E3779B97F4A7C15UL;
                var value = state;
                value = (value ^ (value >> 30)) * 0xBF58476D1CE4E5B9UL;
                value = (value ^ (value >> 27)) * 0x94D049BB133111EBUL;
                value ^= value >> 31;
                return (int)(value % (uint)exclusiveMaximum);
            }
        }
    }
}
