using System.Text.Json;

namespace Deepfield.Engine;

/// <summary>A pinned catalog snapshot. Names and orbital values are astronomy, never clan identity.</summary>
public static class RealStarMap
{
    public const int Version = 1;
    public static GeneratedStarMap Generate()
    {
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
        double Distance(int a, int b)
        {
            var dx = positions[a].X - positions[b].X;
            var dy = positions[a].Y - positions[b].Y;
            var dz = positions[a].Z - positions[b].Z;
            return dx * dx + dy * dy + dz * dz;
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
        var second = systems.Where(s => s.Id != 0).OrderByDescending(s => Distance(0, s.Id)).ThenBy(s => s.Id).First().Id;
        var homes = new[] { new HomeworldAssignment(0, 0, 0), new HomeworldAssignment(1, second, 0) };
        var settings = new StarMapSettings(systems.Length, 1000, 700, 1, 2, 2);
        return new GeneratedStarMap(StarMapGenerator.CurrentVersion, 0, settings, systems,
            links.OrderBy(l => l.Item1).ThenBy(l => l.Item2).Select(l => new StarMapLink(l.Item1, l.Item2)).ToArray(),
            homes, Version, catalog);
    }
}
