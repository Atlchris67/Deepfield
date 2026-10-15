using System.Numerics;

namespace Deepfield.Engine.Combat;

// Shared deterministic counter model; campaigns opt in explicitly.
public enum Hull { Interceptor, TorpedoBoat, Cruiser, Bomber, Disruptor }
public record Fleet(int[] Counts)
{
    public int Value => Counts.Select((count,index)=>count*CounterBattle.Cost((Hull)index)).Sum();
    public static Fleet Single(Hull hull,int count){var counts=new int[5];counts[(int)hull]=count;return new(counts);}
}
public record Outcome(Fleet Left, Fleet Right)
{
    public string Winner => Left.Value>0?"left":Right.Value>0?"right":"draw";
}
public static class CounterBattle
{
    public static int Cost(Hull hull) => hull switch { Hull.Interceptor=>5,Hull.TorpedoBoat=>10,Hull.Cruiser=>15,Hull.Bomber=>12,Hull.Disruptor=>8,_=>throw new ArgumentOutOfRangeException(nameof(hull)) };
    public static bool Counters(Hull attacker,Hull defender) => (attacker,defender) switch
    {
        (Hull.Interceptor,Hull.Bomber or Hull.TorpedoBoat)=>true,
        (Hull.TorpedoBoat,Hull.Cruiser or Hull.Disruptor)=>true,
        (Hull.Cruiser,Hull.Interceptor or Hull.Bomber)=>true,
        (Hull.Bomber,Hull.Disruptor or Hull.TorpedoBoat)=>true,
        (Hull.Disruptor,Hull.Cruiser or Hull.Interceptor)=>true,
        _=>false
    };
    static void Validate(Fleet fleet)
    {
        if(fleet.Counts.Length!=5||fleet.Counts.Any(n=>n<0||n>10006))throw new ArgumentException("Five hull counts, each 0–10006, required.");
    }
    static BigInteger AttackNumerator(Fleet own,Fleet enemy)
    {
        BigInteger numerator=0;
        for(var i=0;i<5;i++)for(var j=0;j<5;j++)
        {
            var factor=i==j?2:Counters((Hull)i,(Hull)j)?3:1;
            numerator+=(BigInteger)own.Counts[i]*Cost((Hull)i)*enemy.Counts[j]*Cost((Hull)j)*factor;
        }
        return numerator;
    }
    public static Outcome Resolve(Fleet left,Fleet right)
    {
        Validate(left);Validate(right);
        var l=new Fleet(left.Counts.ToArray());var r=new Fleet(right.Counts.ToArray());
        if(l.Value==0||r.Value==0)return new(l,r);
        // Cross multiplication keeps comparison exact, symmetric and free of RNG.
        var leftScore=AttackNumerator(l,r)*l.Value;
        var rightScore=AttackNumerator(r,l)*r.Value;
        if(leftScore==rightScore)return new(new(new int[5]),new(new int[5]));
        var winner=leftScore>rightScore?l:r;var loser=leftScore>rightScore?r:l;
        var winningScore=BigInteger.Max(leftScore,rightScore);var losingScore=BigInteger.Min(leftScore,rightScore);
        var damage=(int)(((BigInteger)winner.Value*losingScore+winningScore-1)/winningScore);
        // Provisional screening rule: lowest-cost hulls absorb damage first.
        // Whole-hull rounding is explicit; no hidden fractional survivors.
        foreach(var hull in Enum.GetValues<Hull>().OrderBy(Cost))
        {
            var lost=Math.Min(winner.Counts[(int)hull],(damage+Cost(hull)-1)/Cost(hull));
            winner.Counts[(int)hull]-=lost;damage=Math.Max(0,damage-lost*Cost(hull));
        }
        Array.Clear(loser.Counts);
        return new(l,r);
    }
}
