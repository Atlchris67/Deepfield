namespace Deepfield.Engine;

/// <summary>
/// Inhabitants of a colony (owner decision, 2026-11-27). Every colony in a campaign with <see cref="Game.PopulationVersion"/> 1
/// has between 0 and <see cref="Capacity"/> inhabitants. They grow every turn, faster on a more habitable world, and the
/// colony's credit income rises with them. Both modes use this rule. Campaigns saved before it keep flat colony income.
/// </summary>
public static class Population
{
    /// <summary>A full colony. Homeworlds start full.</summary>
    public const int Capacity = 100;
    /// <summary>The inhabitants of a colony on the turn it is founded.</summary>
    public const int Founding = 20;

    public static bool Enabled(Game game) => game.PopulationVersion == 1;

    /// <summary>Inhabitants added each turn: 3 on the harshest world, 15 on the kindest.</summary>
    public static int Growth(int habitabilityScore) => 3 + Math.Clamp(habitabilityScore, 0, 100) / 8;

    public static int Growth(Star colony) => colony.Environment is null ? 0 : Growth(Habitability.Score(colony.Environment));

    /// <summary>Credits a colony earns each turn before collectors: 5 when empty, 15 when full.</summary>
    public static int Income(int inhabitants) => 5 + Math.Clamp(inhabitants, 0, Capacity) / 10;

    /// <summary>Called once a turn for each colony, after that turn's income is paid.</summary>
    public static void Grow(Star colony) => colony.Inhabitants = Math.Min(Capacity, colony.Inhabitants + Growth(colony));
}
