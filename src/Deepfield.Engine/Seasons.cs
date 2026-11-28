namespace Deepfield.Engine;

public sealed record ClanStanding(string Name, int Colonies, int Collectors, int Ships);
// Winner follows Game.Winner: a clan index, the number of clans for a shared victory (2 in a two-clan season), or null when the
// season was ended early. Winners names every winning clan; it is null in records from before seasons could have more than two clans.
public sealed record SeasonRecord(int Season, int? Winner, int Turns, DateTimeOffset? Started, DateTimeOffset Ended, ClanStanding[] Standings, int MapSeed, int[]? Winners = null);
/// <summary>
/// What wins a season, chosen by whoever sets the game up. A clan wins by holding <see cref="Colonies"/> colonies and
/// <see cref="Collectors"/> collectors at the end of a turn. With a <see cref="TurnLimit"/> above zero, a season nobody
/// has won by the end of that turn goes to the clan with more colonies, then more collectors; equal is a shared victory.
/// </summary>
public sealed record VictoryRule(int Colonies = 4, int Collectors = 8, int TurnLimit = 0)
{
    /// <summary>
    /// The condition a new campaign with a mode starts with (play-balance pass, owner decision 2026-11-28): a season of about
    /// two weeks. The constructor defaults stay 4 and 8 because they are what a campaign saved without a condition has always meant.
    /// </summary>
    public static VictoryRule Standard => new(5, 12, 0);
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
public sealed record Outcome(int? Winner, int Turns, DateTimeOffset? Ended, ClanStanding[] Standings, int[]? Winners = null);

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
    public static Outcome? Outcome(Game g) => g.Winner is null ? null : new(g.Winner, TurnsPlayed(g), g.Ended, Standings(g), g.Winners?.ToArray());

    public static SeasonRecord Record(Game g, DateTimeOffset now)
        => new(g.Season, g.Winner, TurnsPlayed(g), g.Started, g.Ended ?? now, Standings(g), g.GeneratedMap?.Seed ?? g.Seed, g.Winners?.ToArray());

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
    public static void StartNext(Game g, int expectedSeason, int mapSeed, DateTimeOffset now, bool endEarly = false, VictoryRule? victory = null,
        string? mode = null, int[]? industrialFocus = null, int? clans = null)
    {
        var players = Players(g, clans, mode ?? g.Mode);
        victory = victory?.Validated() ?? g.Victory;
        // The expected season makes a repeated request harmless: the second one no longer matches.
        if (expectedSeason != g.Season) throw new RuleException("That season has already been replaced. Refresh to see the current one.");
        if (g.Winner is null && !endEarly) throw new RuleException("This season has no winner yet. Confirm that you want to end it early.");
        // A campaign from before modes keeps its saved rule versions unless the game creator now picks a mode.
        mode = mode is null ? g.Mode : Modes.Validated(mode);
        var map = RealStarMap.Generate(mapSeed, players);
        // Industrial focus carries over only when the number of clans stays the same.
        var carried = players == g.Clans.Count ? g.Clans.Select(c => c.IndustrialFocus).ToArray() : null;
        var next = mode is null
            ? Rules.CreateFromMap(map, now, false, g.EconomyVersion, g.CombatVersion, g.LogisticsVersion,
                industrialFocus ?? (g.GeneratedMap?.RealCatalogVersion is null ? null : carried))
            : Modes.Create(map, now, false, mode, mode == Modes.Simple ? industrialFocus : industrialFocus ?? carried);
        next.Season = g.Season + 1;
        next.Started = now;
        next.Victory = victory;
        next.History = [.. g.History, Record(g, now)];
        if (next.History.Count > MaximumHistory) next.History.RemoveRange(0, next.History.Count - MaximumHistory);
        Replace(g, next, $"Season {next.Season} begins on a new map. Your clan starts again from one homeworld. Rules: {Modes.Name(next.Mode)}. To win: {Rules.Victory(next).Describe()}.");
    }

    /// <summary>
    /// Changes the mode of the current season by setting it up again on the same map. Allowed only before its first
    /// turn resolves; orders already submitted for that turn are discarded because the rules they were written for changed.
    /// </summary>
    public static void SetMode(Game g, int expectedSeason, string mode, DateTimeOffset now, int[]? industrialFocus = null, int? clans = null)
    {
        var players = Players(g, clans, mode);
        if (expectedSeason != g.Season) throw new RuleException("That season has already been replaced. Refresh to see the current one.");
        if (g.Winner is not null || g.Turn != 1) throw new RuleException("The mode can only be changed before the first turn of a season resolves. Choose it when starting the next season.");
        if (g.GeneratedMap?.RealCatalogVersion is null) throw new RuleException("This campaign uses the original map. Choose a mode when starting the next season.");
        var next = Modes.Create(RealStarMap.Generate(g.GeneratedMap.Seed, players), now, false, Modes.Validated(mode), industrialFocus);
        next.Season = g.Season; next.Started = g.Started; next.Deadline = g.Deadline; next.Victory = g.Victory; next.History = g.History;
        Replace(g, next, $"Season {g.Season} was set to {Modes.Name(mode)} before its first turn. Orders already submitted this turn were cleared.");
    }

    // The number of clans for the next setup: unchanged unless the game creator chooses. Three or four need a mode.
    static int Players(Game g, int? clans, string? mode)
    {
        var players = clans ?? g.Clans.Count;
        if (players is < 2 or > Rules.MaximumClans) throw new RuleException($"A season has between 2 and {Rules.MaximumClans} clans.");
        if (players > 2 && mode is null) throw new RuleException("Three or four clans need simple or advanced mode.");
        return players;
    }

    // Carries the clans over and copies the new state into the loaded instance, because stores save the instance they loaded.
    private static void Replace(Game g, Game next, string report)
    {
        // A clan added this season keeps its new default name; a clan left out of this season is gone, with its channel.
        for (var team = 0; team < Math.Min(g.Clans.Count, next.Clans.Count); team++)
        {
            next.Clans[team].Name = g.Clans[team].Name;
            next.Clans[team].Ai = g.Clans[team].Ai;
            next.Clans[team].Messages = g.Clans[team].Messages;
            next.Clans[team].Reports.Insert(0, report);
        }
        foreach (var property in typeof(Game).GetProperties().Where(p => p.CanRead && p.CanWrite))
            property.SetValue(g, property.GetValue(next));
    }
}
