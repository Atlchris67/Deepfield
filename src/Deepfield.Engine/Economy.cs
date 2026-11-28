namespace Deepfield.Engine;

/// <summary>Opt-in rules for new test campaigns; existing campaigns keep version 0.</summary>
public static class Economy
{
    public static int CollectorIncome(int collectors) => Math.Min(3,Math.Max(0,collectors)) switch { 0=>0,1=>3,2=>5,_=>6 };
    public static int Income(Game game, Star colony) => (Population.Enabled(game) ? Population.Income(colony.Inhabitants) : 15) + (game.EconomyVersion==1 ? CollectorIncome(colony.Collectors) : 0);
}
