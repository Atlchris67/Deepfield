namespace Deepfield.Engine;

public record PlanetFleet(int Team, int? CombatShips, int? Scouts, int[]? Composition, int? TotalShips);
public record PlanetStats(string Knowledge, int? Turn, DateTimeOffset? At, string? Phase, string? Mission,
    bool OwnerObserved, int? Owner, bool? EnemyPresent, string? FleetBand, int? Collectors, int? Defense,
    int? ColonyIncome, List<PlanetFleet> Fleets);

/// <summary>Only accepts the already-authorized map view and this clan's reports, never hidden world state.</summary>
public static class PlanetStatistics
{
    static PlanetFleet Fleet(int team, int? combat, int? scouts, int[]? composition) =>
        new(team, combat, scouts, composition?.ToArray(), combat.HasValue && scouts.HasValue ? combat + scouts : null);

    public static PlanetStats Project(StarView star, IEnumerable<Intelligence> reports, int team, int turn, int economyVersion)
    {
        if (star.Visible)
            return new("current", turn, null, "campaign snapshot", null, true, star.Owner, null, null,
                star.Collectors, star.Defense,
                star.Owner == team && star.Collectors.HasValue ? 15 + (economyVersion == 1 ? Economy.CollectorIncome(star.Collectors.Value) : 0) : null,
                Enumerable.Range(0, 2).Select(t => Fleet(t, star.Ships?[t], star.Scouts?[t], star.Fleets?[t])).ToList());

        // Use one snapshot, never combine observations from different phases into apparent current state.
        var report = reports.Where(r => r.Star == star.Id).OrderByDescending(r => r.Turn).ThenByDescending(r => r.At).FirstOrDefault();
        if (report is null)
            return new(star.Known ? "charted" : "unknown", null, null, null, null, false, null, null, null, null, null, null, []);
        return new("historical", report.Turn, report.At, report.Phase, report.Mission,
            report.OwnerObserved, report.OwnerObserved ? report.Owner : null, report.EnemyPresent, report.FleetBand,
            report.Collectors, report.Defense, null,
            [Fleet(1 - team, report.EnemyShips, report.EnemyScouts, report.EnemyComposition)]);
    }
}
