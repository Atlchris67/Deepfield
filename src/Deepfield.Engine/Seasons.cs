namespace Deepfield.Engine;

public sealed record ClanStanding(string Name, int Colonies, int Collectors, int Ships);
// Winner follows Game.Winner: a clan index, 2 for a shared victory, or null when the season was ended early.
public sealed record SeasonRecord(int Season, int? Winner, int Turns, DateTimeOffset? Started, DateTimeOffset Ended, ClanStanding[] Standings, int MapSeed);
/// <summary>
/// What wins a season, chosen by whoever sets the game up. A clan wins by holding <see cref="Colonies"/> colonies and
/// <see cref="Collectors"/> collectors at the end of a turn. With a <see cref="TurnLimit"/> above zero, a season nobody
/// has won by the end of that turn goes to the clan with more colonies, then more collectors; equal is a shared victory.
/// </summary>
public sealed record VictoryRule(int Colonies = 4, int Collectors = 8, int TurnLimit = 0)
{
    public const int MinimumColonies = 2, MaximumColonies = 12, MaximumCollectors = 60, MinimumTurnLimit = 5, MaximumTurnLimit = 365;
    public VictoryRule Validated()
    {
        if (Colonies is < MinimumColonies or > MaximumColonies) throw new RuleException($"Colonies to win must be between {MinimumColonies} and {MaximumColonies}.");
        if (Collectors < Colonies || Collectors > MaximumCollectors) throw new RuleException($"Collectors to win must be between the number of colonies and {MaximumCollectors}.");
        if (TurnLimit != 0 && TurnLimit is < MinimumTurnLimit or > MaximumTurnLimit) throw new RuleException($"A turn limit must be between {MinimumTurnLimit} and {MaximumTurnLimit} turns, or 0 for none.");
        return this;
    }
    public string Describe() => $"{Colonies} colonies and {Collectors} collectors" + (TurnLimit > 0 ? $", or the stronger clan after turn {TurnLimit}" : "");
}
public sealed record Outcome(int? Winner, int Turns, DateTimeOffset? Ended, ClanStanding[] Standings);

/// <summary>A campaign is played as a sequence of seasons. Each season is a fresh map; only the record of past seasons and the clan channels carry over.</summary>
public static class Seasons
{
    public const int MaximumHistory = 50;

    public static ClanStanding[] Standings(Game g) => g.Clans.Select((clan, team) =>
    {
        var owned = g.Stars.Where(s => s.Owner == team).ToList();
        return new ClanStanding(clan.Name, owned.Count, owned.Sum(s => s.Collectors),
            g.Stars.Sum(s => s.Fleets is { } fleets ? fleets[team].Sum() : s.Ships[team]));
    }).ToArray();

    // Completed turns: the turn counter has already moved on when a winner is recorded.
    public static int TurnsPlayed(Game g) => Math.Max(0, g.Turn - 1);

    /// <summary>The final result, shown to both clans once the season is decided. Null while play continues.</summary>
    public static Outcome? Outcome(Game g) => g.Winner is null ? null : new(g.Winner, TurnsPlayed(g), g.Ended, Standings(g));

    public static SeasonRecord Record(Game g, DateTimeOffset now)
        => new(g.Season, g.Winner, TurnsPlayed(g), g.Started, g.Ended ?? now, Standings(g), g.GeneratedMap?.Seed ?? g.Seed);

    /// <summary>Changes what wins the current season. Allowed only before its first turn resolves, so nobody has planned around the old rule.</summary>
    public static void SetVictory(Game g, int expectedSeason, VictoryRule victory)
    {
        if (expectedSeason != g.Season) throw new RuleException("That season has already been replaced. Refresh to see the current one.");
        if (g.Winner is not null || g.Turn != 1) throw new RuleException("The winning condition can only be changed before the first turn of a season resolves. Set it when starting the next season.");
        g.Victory = victory.Validated();
        foreach (var clan in g.Clans) clan.Reports.Insert(0, $"The winning condition for season {g.Season} was set: {victory.Describe()}.");
    }

    /// <summary>
    /// Replaces the campaign in place with the next season: a new real-star map from <paramref name="mapSeed"/>,
    /// the same clans and rule versions, and the finished season added to the history.
    /// </summary>
    public static void StartNext(Game g, int expectedSeason, int mapSeed, DateTimeOffset now, bool endEarly = false, VictoryRule? victory = null)
    {
        victory = victory?.Validated() ?? g.Victory;
        // The expected season makes a repeated request harmless: the second one no longer matches.
        if (expectedSeason != g.Season) throw new RuleException("That season has already been replaced. Refresh to see the current one.");
        if (g.Winner is null && !endEarly) throw new RuleException("This season has no winner yet. Confirm that you want to end it early.");
        var next = Rules.CreateFromMap(RealStarMap.Generate(mapSeed), now, false, g.EconomyVersion, g.CombatVersion,
            g.LogisticsVersion, g.GeneratedMap?.RealCatalogVersion is null ? null : g.Clans.Select(c => c.IndustrialFocus).ToArray());
        next.Season = g.Season + 1;
        next.Started = now;
        next.Victory = victory;
        next.History = [.. g.History, Record(g, now)];
        if (next.History.Count > MaximumHistory) next.History.RemoveRange(0, next.History.Count - MaximumHistory);
        for (var team = 0; team < g.Clans.Count; team++)
        {
            next.Clans[team].Name = g.Clans[team].Name;
            next.Clans[team].Ai = g.Clans[team].Ai;
            next.Clans[team].Messages = g.Clans[team].Messages;
            next.Clans[team].Reports.Insert(0, $"Season {next.Season} begins on a new map. Your clan starts again from one homeworld. To win: {Rules.Victory(next).Describe()}.");
        }
        // Stores save the instance they loaded, so the new season is copied into it.
        foreach (var property in typeof(Game).GetProperties().Where(p => p.CanRead && p.CanWrite))
            property.SetValue(g, property.GetValue(next));
    }
}
