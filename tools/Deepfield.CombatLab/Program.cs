using Deepfield.Engine.Combat;
using System.Text.Json;

var hulls=Enum.GetValues<Hull>();var checks=0;
void Check(bool value,string message){if(!value)throw new Exception(message);checks++;}
foreach(var hull in hulls)
{
    Check(hulls.Count(other=>CounterBattle.Counters(hull,other))==2,"Every hull needs exactly two favorable matchups");
    Check(hulls.Count(other=>CounterBattle.Counters(other,hull))==2,"Every hull must have exactly two counters");
    foreach(var opponent in hulls.Where(other=>other!=hull))
    {
        Check(CounterBattle.Counters(hull,opponent)!=CounterBattle.Counters(opponent,hull),"Counter matrix must have no missing or reciprocal edges");
        // 120 credits is divisible by all five costs, making these fair budget comparisons.
        var result=CounterBattle.Resolve(Fleet.Single(hull,120/CounterBattle.Cost(hull)),Fleet.Single(opponent,120/CounterBattle.Cost(opponent)));
        Check(result.Winner==(CounterBattle.Counters(hull,opponent)?"left":"right"),"Equal-budget counter must win");
    }
}
// Exhaust all 3^5 fleet compositions with 0/1/2 ships of each class against each other.
var fleets=Enumerable.Range(0,243).Select(value=>{var counts=new int[5];for(var i=0;i<5;i++){counts[i]=value%3;value/=3;}return new Fleet(counts);}).ToList();
foreach(var left in fleets)foreach(var right in fleets)
{
    var beforeLeft=left.Counts.ToArray();var beforeRight=right.Counts.ToArray();
    var forward=CounterBattle.Resolve(left,right);var reverse=CounterBattle.Resolve(right,left);
    Check(forward.Left.Counts.SequenceEqual(reverse.Right.Counts)&&forward.Right.Counts.SequenceEqual(reverse.Left.Counts),"Mirrored compositions must have mirrored survivors");
    Check(left.Counts.SequenceEqual(beforeLeft)&&right.Counts.SequenceEqual(beforeRight),"Simulator must not mutate inputs");
    Check(forward.Left.Counts.Zip(left.Counts).All(p=>p.First>=0&&p.First<=p.Second)&&forward.Right.Counts.Zip(right.Counts).All(p=>p.First>=0&&p.First<=p.Second),"Cannot create ships or negative casualties");
}
var huge=CounterBattle.Resolve(new([10000,10000,10000,10000,10000]),new([10000,10000,10000,10000,10000]));
Check(huge.Winner=="draw","Maximum supported equal fleets must resolve without overflow");
var rejected=false;try{CounterBattle.Resolve(new([-1,0,0,0,0]),new([0,0,0,0,0]));}catch(ArgumentException){rejected=true;}Check(rejected,"Negative fleets must be rejected");
var reinforcementCases=0;
foreach(var left in fleets)foreach(var right in fleets)
{
    var baseline=CounterBattle.Resolve(left,right);
    for(var hull=0;hull<5;hull++)
    {
        var reinforced=left.Counts.ToArray();reinforced[hull]++;
        var result=CounterBattle.Resolve(new(reinforced),right);
        Check(result.Left.Value>=baseline.Left.Value,"Adding any hull cannot reduce own surviving value or turn victory into defeat");reinforcementCases++;
    }
}
foreach(var scale in new[]{1,10,100,1000})
{
    var opponent=Fleet.Single(Hull.TorpedoBoat,10*scale);
    var original=CounterBattle.Resolve(Fleet.Single(Hull.Interceptor,8*scale),opponent);
    var reinforced=CounterBattle.Resolve(new([8*scale,0,scale,0,0]),opponent);
    Check(original.Winner=="left"&&reinforced.Winner=="left"&&reinforced.Left.Value>=original.Left.Value,"Reviewer reinforcement fixture and scaled variants cannot reverse victory");
}
var random=new Random(42017);
for(var sample=0;sample<2000;sample++)
{
    var left=new Fleet(Enumerable.Range(0,5).Select(_=>random.Next(0,5001)).ToArray());
    var right=new Fleet(Enumerable.Range(0,5).Select(_=>random.Next(0,5001)).ToArray());
    var larger=left.Counts.Select(count=>count+random.Next(0,1001)).ToArray();
    Check(CounterBattle.Resolve(new(larger),right).Left.Value>=CounterBattle.Resolve(left,right).Left.Value,"Larger mixed fleets preserve reinforcement monotonicity");
}
Console.WriteLine($"PASS {checks} assertions: 59,049 mirrored pairs, {reinforcementCases} one-hull reinforcement cases, 4 scaled reviewer fixtures, 2,000 larger mixed cases, and all 20 directed equal-budget matchups.");
Console.WriteLine("Shared counter model; used only by explicitly opted-in typed preview campaigns.");
Console.WriteLine(JsonSerializer.Serialize(hulls.Select(h=>new{Hull=h.ToString(),Cost=CounterBattle.Cost(h),Counters=hulls.Where(o=>CounterBattle.Counters(h,o)).Select(o=>o.ToString())}),new JsonSerializerOptions{WriteIndented=true}));
