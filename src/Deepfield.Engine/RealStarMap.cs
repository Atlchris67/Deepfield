using System.Text.Json;

namespace Deepfield.Engine;

/// <summary>A pinned catalog snapshot. Names and orbital values are astronomy, never clan identity.</summary>
public static class RealStarMap
{
    public const int Version = 1;
    /// <summary>
    /// Seed 0 is the original fixed layout that existing saves were created from and must keep reproducing.
    /// Any other seed gives a different, repeatable set of links and a different pair of homeworlds.
    /// </summary>
    public static GeneratedStarMap Generate(int seed = 0, int players = 2)
    {
        if (players is < 2 or > Rules.MaximumClans) throw new RuleException($"A season has between 2 and {Rules.MaximumClans} clans.");
        using var stream = typeof(RealStarMap).Assembly.GetManifestResourceStream("Deepfield.Engine.realSystems.json")
            ?? throw new InvalidOperationException("Real star catalog is missing.");
        using var document = JsonDocument.Parse(stream);
        var hosts = document.RootElement.GetProperty("systems").EnumerateArray().ToArray();
        var catalog = hosts.Select((host, id) => new CatalogSystem(id,
            host.GetProperty("name").GetString()!, host.GetProperty("raDeg").GetDouble(),
            host.GetProperty("decDeg").GetDouble(), host.GetProperty("distancePc").GetDouble(),
            host.GetProperty("temperatureK").ValueKind == JsonValueKind.Null ? null : host.GetProperty("temperatureK").GetDouble(),
            host.GetProperty("planets").EnumerateArray().Select((planet, planetId) => new CatalogPlanet(
                planetId, planet.GetProperty("name").GetString()!, planet.GetProperty("periodDays").GetDouble(),
                planet.GetProperty("semiMajorAu").GetDouble(), planet.GetProperty("radiusEarth").ValueKind == JsonValueKind.Null
                    ? null : planet.GetProperty("radiusEarth").GetDouble())).ToArray())).ToArray();
        // Flat coordinates are only for the legacy map preview. The playable graph
        // is built from the catalog positions in three-dimensional space.
        var systems = catalog.Select(host => new GeneratedSystem(host.Id, host.Name,
            Math.Clamp((int)Math.Round((host.RaDeg / 360) * 900 + 50), 0, 1000),
            Math.Clamp((int)Math.Round((1 - (host.DecDeg + 90) / 180) * 600 + 50), 0, 700))).ToArray();
        var links = new HashSet<(int, int)>();
        var connected = new HashSet<int> { 0 };
        var positions = catalog.Select(host =>
        {
            var ra = host.RaDeg * Math.PI / 180;
            var dec = host.DecDeg * Math.PI / 180;
            return (X: host.DistancePc * Math.Cos(dec) * Math.Cos(ra),
                Y: host.DistancePc * Math.Sin(dec),
                Z: host.DistancePc * Math.Cos(dec) * Math.Sin(ra));
        }).ToArray();
        // A seeded map stretches or shrinks each pair's distance a little, so the nearest-neighbour graph
        // changes from season to season while routes still follow real proximity.
        double Distance(int a, int b)
        {
            var dx = positions[a].X - positions[b].X;
            var dy = positions[a].Y - positions[b].Y;
            var dz = positions[a].Z - positions[b].Z;
            var squared = dx * dx + dy * dy + dz * dz;
            return seed == 0 ? squared : squared * (0.45 + 1.35 * Unit(seed, Math.Min(a, b), Math.Max(a, b)));
        }
        void Add(int a, int b) { if (a != b) links.Add((Math.Min(a, b), Math.Max(a, b))); }
        while (connected.Count < systems.Length)
        {
            var edge = (from a in connected from b in systems.Select(s => s.Id) where !connected.Contains(b)
                        orderby Distance(a, b), a, b select (a, b)).First();
            Add(edge.a, edge.b); connected.Add(edge.b);
        }
        foreach (var system in systems)
            foreach (var other in systems.Where(s => s.Id != system.Id).OrderBy(s => Distance(system.Id, s.Id)).ThenBy(s => s.Id).Take(2))
                Add(system.Id, other.Id);
        HomeworldAssignment[] homes;
        if (players > 2) homes = FairHomes(seed, systems.Length, links, players);
        else if (seed == 0)
        {
            var second = systems.Where(s => s.Id != 0).OrderByDescending(s => Distance(0, s.Id)).ThenBy(s => s.Id).First().Id;
            homes = [new HomeworldAssignment(0, 0, 0), new HomeworldAssignment(1, second, 0)];
        }
        else
        {
            var (first, other) = FairHomes(seed, systems.Length, links);
            homes = [new HomeworldAssignment(0, first, 0), new HomeworldAssignment(1, other, 0)];
        }
        var settings = new StarMapSettings(systems.Length, 1000, 700, 1, 2, players);
        return new GeneratedStarMap(StarMapGenerator.CurrentVersion, seed, settings, systems,
            links.OrderBy(l => l.Item1).ThenBy(l => l.Item2).Select(l => new StarMapLink(l.Item1, l.Item2)).ToArray(),
            homes, Version, catalog);
    }

    /// <summary>Hop counts from one system to every other along the links.</summary>
    public static int[] Hops(int count, IEnumerable<(int, int)> links, int from)
    {
        var neighbours = Enumerable.Range(0, count).Select(_ => new List<int>()).ToArray();
        foreach (var (a, b) in links) { neighbours[a].Add(b); neighbours[b].Add(a); }
        var hops = Enumerable.Repeat(int.MaxValue, count).ToArray();
        hops[from] = 0;
        var queue = new Queue<int>([from]);
        while (queue.Count > 0)
        {
            var at = queue.Dequeue();
            foreach (var next in neighbours[at])
                if (hops[next] == int.MaxValue) { hops[next] = hops[at] + 1; queue.Enqueue(next); }
        }
        return hops;
    }

    /// <summary>How uneven a pair of homeworlds is: 0 is perfectly even. Compares nearby systems and reachable territory.</summary>
    public static int Imbalance(int[] fromA, int[] fromB)
    {
        int Within(int[] hops, int limit) => hops.Count(h => h > 0 && h <= limit);
        var closerToA = Enumerable.Range(0, fromA.Length).Count(i => fromA[i] < fromB[i]);
        var closerToB = Enumerable.Range(0, fromA.Length).Count(i => fromB[i] < fromA[i]);
        return Math.Abs(Within(fromA, 1) - Within(fromB, 1)) * 2 + Math.Abs(Within(fromA, 2) - Within(fromB, 2)) + Math.Abs(closerToA - closerToB);
    }

    // Homeworlds are drawn from the pairs that are well separated and the most evenly matched,
    // so a new season moves the clans without handing either one a better start.
    static (int First, int Second) FairHomes(int seed, int count, HashSet<(int, int)> links)
    {
        var hops = Enumerable.Range(0, count).Select(id => Hops(count, links, id)).ToArray();
        var pairs = (from a in Enumerable.Range(0, count) from b in Enumerable.Range(a + 1, count - a - 1)
                     select (A: a, B: b, Separation: hops[a][b], Imbalance: Imbalance(hops[a], hops[b]))).ToList();
        var longest = pairs.Max(p => p.Separation);
        // Far enough apart that neither clan meets the other in the opening turns, without insisting on the
        // very longest route: that would leave too few pairs to find an even one.
        var separated = pairs.Where(p => p.Separation >= Math.Max(3, (longest + 1) / 2)).ToList();
        if (separated.Count == 0) separated = pairs.Where(p => p.Separation == longest).ToList();
        var fairest = separated.Min(p => p.Imbalance);
        var choices = separated.Where(p => p.Imbalance <= fairest + 1).OrderBy(p => p.A).ThenBy(p => p.B).ToList();
        var pick = choices[(int)(Unit(seed, -1, -1) * choices.Count)];
        return Unit(seed, -2, -2) < 0.5 ? (pick.A, pick.B) : (pick.B, pick.A);
    }

    /// <summary>How uneven a set of homeworlds is: 0 is perfectly even. Compares nearby systems and the territory nearest each home.</summary>
    public static int Imbalance(int[][] fromHomes)
    {
        int Within(int[] hops, int limit) => hops.Count(h => h > 0 && h <= limit);
        int Spread(Func<int[], int> measure) { var values = fromHomes.Select(measure).ToArray(); return values.Max() - values.Min(); }
        var nearest = fromHomes.Select((hops, home) => Enumerable.Range(0, hops.Length).Count(i => fromHomes.Where((_, other) => other != home).All(rival => hops[i] < rival[i]))).ToArray();
        return Spread(hops => Within(hops, 1)) * 2 + Spread(hops => Within(hops, 2)) + nearest.Max() - nearest.Min();
    }

    // Three or four homeworlds: as far apart as the map allows (within one hop of the best possible), then the most even
    // sets, then a seeded pick and a seeded order, so no clan is always handed the same corner.
    static HomeworldAssignment[] FairHomes(int seed, int count, HashSet<(int, int)> links, int players)
    {
        var hops = Enumerable.Range(0, count).Select(id => Hops(count, links, id)).ToArray();
        var sets = new List<(int[] Homes, int Separation)>();
        void Choose(List<int> chosen, int from, int separation)
        {
            if (chosen.Count == players) { sets.Add((chosen.ToArray(), separation)); return; }
            for (var next = from; next < count; next++)
            {
                var nearest = chosen.Count == 0 ? int.MaxValue : chosen.Min(home => hops[home][next]);
                if (nearest < 2) continue; // Homeworlds are never neighbours.
                chosen.Add(next); Choose(chosen, next + 1, Math.Min(separation, nearest)); chosen.RemoveAt(chosen.Count - 1);
            }
        }
        Choose([], 0, int.MaxValue);
        if (sets.Count == 0) throw new RuleException("This map has no room for that many clans.");
        var widest = sets.Max(set => set.Separation);
        var scored = sets.Where(set => set.Separation >= Math.Max(2, widest - 1))
            .Select(set => (set.Homes, Imbalance: Imbalance(set.Homes.Select(home => hops[home]).ToArray()))).ToList();
        var fairest = scored.Min(set => set.Imbalance);
        var choices = scored.Where(set => set.Imbalance <= fairest + 1).OrderBy(set => string.Join(",", set.Homes.Select(home => home.ToString("D3")))).ToList();
        var pick = choices[(int)(Unit(seed, -1, -1) * choices.Count)].Homes.ToList();
        var homes = new HomeworldAssignment[players];
        for (var slot = 0; slot < players; slot++)
        {
            var index = (int)(Unit(seed, -2, slot) * pick.Count);
            homes[slot] = new HomeworldAssignment(slot, pick[index], 0); pick.RemoveAt(index);
        }
        return homes;
    }

    // Fixed arithmetic rather than System.Random, so a seed means the same map on every runtime.
    static double Unit(int seed, int a, int b)
    {
        unchecked
        {
            var x = (ulong)(uint)seed * 0x9E3779B97F4A7C15UL ^ (ulong)(uint)a * 0xBF58476D1CE4E5B9UL ^ (ulong)(uint)b * 0x94D049BB133111EBUL;
            x ^= x >> 30; x *= 0xBF58476D1CE4E5B9UL; x ^= x >> 27; x *= 0x94D049BB133111EBUL; x ^= x >> 31;
            return (x >> 11) / (double)(1UL << 53);
        }
    }
}
