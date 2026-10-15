namespace Deepfield.Engine;

/// <summary>Opt-in rules for new test campaigns; existing campaigns keep version 0.</summary>
public static class Economy
{
    public static int CollectorIncome(int collectors) => Math.Min(3,Math.Max(0,collectors)) switch { 0=>0,1=>3,2=>5,_=>6 };
    public static int Income(Game game, Star colony) => 15 + (game.EconomyVersion==1 ? CollectorIncome(colony.Collectors) : 0);

    public static void Combat(Game game, Star star)
    {
        var strength=star.Ships.ToArray();
        if(star.Owner is int owner)strength[owner]+=star.Defense;
        if(strength[0]==0||strength[1]==0)return;
        var damage=Math.Min(strength[0],strength[1]);
        for(var team=0;team<2;team++)
        {
            var defenseLoss=star.Owner==team?Math.Min(star.Defense,damage):0;
            star.Defense-=defenseLoss;
            var shipLoss=damage-defenseLoss;star.Ships[team]-=shipLoss;
            game.Clans[team].Reports.Insert(0,$"Battle at {star.Name}: lost {shipLoss} ships and {defenseLoss} fixed-defense strength; {star.Ships[team]} ships remain.");
        }
    }
}
