namespace Deepfield.Engine.Combat;

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
    sealed class Edge(int to,int reverse,int capacity,int cost)
    {
        public int To=to,Reverse=reverse,Capacity=capacity,Cost=cost;
    }
    // Exact maximum-value simultaneous salvo. Each ship has one attack; it can
    // destroy one same-class hull or a hull it counters. Integer network flow
    // optimizes target allocation without changing attack power as targets change.
    static int[] Damage(Fleet attacker,Fleet target)
    {
        const int source=10,sink=11,nodes=12;
        var graph=Enumerable.Range(0,nodes).Select(_=>new List<Edge>()).ToArray();
        Edge Add(int from,int to,int capacity,int cost)
        {
            var edge=new Edge(to,graph[to].Count,capacity,cost);
            graph[from].Add(edge);graph[to].Add(new(from,graph[from].Count-1,0,-cost));return edge;
        }
        var targetEdges=new Edge[5];
        for(var h=0;h<5;h++)
        {
            Add(source,h,attacker.Counts[h],0);
            targetEdges[h]=Add(h+5,sink,target.Counts[h],-Cost((Hull)h));
            for(var t=0;t<5;t++)if(h==t||Counters((Hull)h,(Hull)t))Add(h,t+5,50030,0);
        }
        while(true)
        {
            var distance=Enumerable.Repeat(int.MaxValue/4,nodes).ToArray();distance[source]=0;
            var previousNode=new int[nodes];var previousEdge=new int[nodes];
            for(var pass=0;pass<nodes-1;pass++)
            {
                var changed=false;
                for(var node=0;node<nodes;node++)for(var index=0;index<graph[node].Count;index++)
                {
                    var edge=graph[node][index];
                    if(edge.Capacity>0&&distance[node]<int.MaxValue/4&&distance[edge.To]>distance[node]+edge.Cost)
                    {distance[edge.To]=distance[node]+edge.Cost;previousNode[edge.To]=node;previousEdge[edge.To]=index;changed=true;}
                }
                if(!changed)break;
            }
            if(distance[sink]>=0)break;
            var amount=int.MaxValue;
            for(var node=sink;node!=source;node=previousNode[node])amount=Math.Min(amount,graph[previousNode[node]][previousEdge[node]].Capacity);
            for(var node=sink;node!=source;node=previousNode[node])
            {var edge=graph[previousNode[node]][previousEdge[node]];edge.Capacity-=amount;graph[node][edge.Reverse].Capacity+=amount;}
        }
        return Enumerable.Range(0,5).Select(h=>target.Counts[h]-targetEdges[h].Capacity).ToArray();
    }
    public static Outcome Resolve(Fleet left,Fleet right)
    {
        Validate(left);Validate(right);
        var inflictedLeft=Damage(left,right);var inflictedRight=Damage(right,left);
        var l=new Fleet(left.Counts.Zip(inflictedRight,(count,lost)=>count-lost).ToArray());
        var r=new Fleet(right.Counts.Zip(inflictedLeft,(count,lost)=>count-lost).ToArray());
        // Decisive-rout abstraction: the side with less surviving credit value
        // loses its remaining ships; equal surviving values mutually destroy.
        var leftValue=l.Value;var rightValue=r.Value;
        if(leftValue<=rightValue)Array.Clear(l.Counts);
        if(rightValue<=leftValue)Array.Clear(r.Counts);
        return new(l,r);
    }
}
