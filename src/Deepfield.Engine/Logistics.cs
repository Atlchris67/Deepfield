namespace Deepfield.Engine;

/// <summary>Only directly linked, owned systems with an operational gate at both ends share stock.</summary>
public static class Logistics
{
    public const int FreighterCapacity = 10;

    public static IReadOnlyList<StarView> Access(View view, int source)
    {
        var start = view.Stars.Single(star => star.Id == source);
        if (start.Owner != view.Team || start.Gate != true) return [start];
        var reached = new HashSet<int> { source };
        var queue = new Queue<int>(); queue.Enqueue(source);
        while (queue.TryDequeue(out var from))
            foreach (var neighbor in view.Stars.Where(star => star.Owner == view.Team && star.Gate == true &&
                         Rules.Linked(view, from, star.Id) && reached.Add(star.Id))) queue.Enqueue(neighbor.Id);
        return view.Stars.Where(star => reached.Contains(star.Id)).OrderBy(star => star.Id).ToArray();
    }

    public static Dictionary<(int Team, int Source), Star[]> Capture(Game game)
    {
        var access = new Dictionary<(int, int), Star[]>();
        foreach (var team in Enumerable.Range(0, game.Clans.Count))
        foreach (var start in game.Stars.Where(star => star.Owner == team))
        {
            if (!start.Gate) { access[(team, start.Id)] = [start]; continue; }
            var reached = new HashSet<int> { start.Id };
            var queue = new Queue<int>(); queue.Enqueue(start.Id);
            while (queue.TryDequeue(out var from))
                foreach (var neighbor in game.Stars.Where(star => star.Owner == team && star.Gate &&
                             Rules.Linked(game, from, star.Id) && reached.Add(star.Id))) queue.Enqueue(neighbor.Id);
            access[(team, start.Id)] = game.Stars.Where(star => reached.Contains(star.Id)).OrderBy(star => star.Id).ToArray();
        }
        return access;
    }

    public static void Spend(IReadOnlyList<Star> sources, IReadOnlyList<int> cost)
    {
        for (var material = 0; material < Materials.Count; material++)
        {
            var left = cost[material];
            foreach (var star in sources)
            {
                var stock = star.Stockpile ?? throw new InvalidOperationException("Owned system has no stockpile.");
                var taken = Math.Min(left, stock[material]);
                stock[material] -= taken; left -= taken;
                if (left == 0) break;
            }
            if (left != 0) throw new InvalidOperationException("Validated material reservation became unavailable.");
        }
    }
}
