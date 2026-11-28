namespace Deepfield.Engine;

/// <summary>
/// The two rule sets a game creator chooses between. They replace choosing the economy, combat, logistics and
/// materials versions one by one. A campaign with no mode is an older campaign that keeps the versions it was saved with.
/// <para>Simple: generic ships, equal-loss combat, colony income only, credits only.</para>
/// <para>Advanced: ship types and design, typed combat, tapered collector income, fixed defenses, materials and mines,
/// local stockpiles with freighters and gates, and clan industrial focus.</para>
/// Both modes use the real-star map, scouting, habitability reports and inhabitants (see <see cref="Population"/>).
/// </summary>
public static class Modes
{
    public const string Simple = "simple", Advanced = "advanced";

    public static string Validated(string? mode)
        => mode is Simple or Advanced ? mode : throw new RuleException("Choose simple or advanced mode.");

    public static string Name(string? mode) => mode switch { Simple => "simple mode", Advanced => "advanced mode", _ => "the campaign's original rules" };

    /// <summary>True when the campaign uses materials, mines and settlement growth.</summary>
    public static bool Industry(Game game) => game.GeneratedMap?.RealCatalogVersion is not null && game.Mode != Simple;

    public static Game Create(GeneratedStarMap map, DateTimeOffset now, bool ai, string mode, int[]? industrialFocus = null)
    {
        Validated(mode);
        if (map.RealCatalogVersion is null) throw new RuleException("New campaigns use the real-star map.");
        if (mode == Simple && industrialFocus is not null && industrialFocus.Any(focus => focus != 0))
            throw new RuleException("Clan industrial focus is an advanced-mode rule.");
        var game = mode == Advanced
            ? Rules.CreateFromMap(map, now, ai, economyVersion: 1, combatVersion: 1, logisticsVersion: 1, industrialFocus)
            : Rules.CreateFromMap(map, now, ai, economyVersion: 0, combatVersion: 0, logisticsVersion: 0);
        game.Mode = mode;
        game.Victory = VictoryRule.Standard;
        // Inhabitants: both modes. Homeworlds start full, so the opening income is the same as before.
        game.PopulationVersion = 1;
        foreach (var star in game.Stars.Where(star => star.Owner is not null)) star.Inhabitants = Population.Capacity;
        if (mode == Simple)
        {
            // Credits only: no material stock, and nothing on the map that only matters to material production.
            foreach (var clan in game.Clans) clan.Materials = null;
            foreach (var star in game.Stars) star.Mines = 0;
        }
        return game;
    }
}
