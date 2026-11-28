using Deepfield.Api;
using Deepfield.Engine;

/// <summary>
/// Plays many whole seasons with every clan run by the computer and prints what happened, for tuning rule numbers.
/// It checks nothing and is not part of the recorded checks: run it with <c>--balance [seasons per row]</c>.
/// </summary>
public static class BalanceReport
{
    sealed record Season(int Turns, bool Finished, int[] Winners, int Colonies, int FullColonies, int YoungInhabitants, int YoungColonies, int IncomeAtEnd, int Battles);

    public static void Run(string[] args)
    {
        var seasons = args.Select(a => int.TryParse(a, out var n) ? n : 0).FirstOrDefault(n => n > 0) is var asked and > 0 ? asked : 200;
        var populations = args.Where(a => a.StartsWith("--population=")).Select(a => int.Parse(a[13..])).DefaultIfEmpty(1).ToArray();
        var limit = args.Where(a => a.StartsWith("--victory=")).Select(a => a[10..].Split(',').Select(int.Parse).ToArray()).FirstOrDefault();
        Console.WriteLine($"{seasons} computer-played seasons per row, map seeds 1 to {seasons}, up to 150 turns each.");
        Console.WriteLine("mode      clans rule  finished  turns: least / median / 9 in 10 / most   won by clan 1,2,3,4 (%)   shared   colonies full at end   new colonies' inhabitants   winner's income   battles");
        foreach (var population in populations)
            foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
                foreach (var clans in new[] { 2, 3, 4 })
                {
                    var played = Enumerable.Range(1, seasons).AsParallel().AsOrdered().Select(seed => Play(mode, clans, seed, population, limit)).ToList();
                    var done = played.Where(s => s.Finished).ToList();
                    var turns = done.Select(s => s.Turns).Order().ToList();
                    int At(double share) => turns.Count == 0 ? 0 : turns[Math.Min(turns.Count - 1, (int)(share * turns.Count))];
                    var wins = Enumerable.Range(0, clans).Select(t => done.Count == 0 ? 0 : 100 * done.Count(s => s.Winners.Contains(t)) / done.Count);
                    var colonies = played.Sum(s => s.Colonies); var young = played.Sum(s => s.YoungColonies);
                    Console.WriteLine($"{mode,-9} {clans,-5} {(population == 0 ? "flat" : "v" + population),-5} {done.Count,4}/{seasons,-4} {At(0),10} / {At(0.5),6} / {At(0.9),8} / {At(1),4}   {string.Join(",", wins),-23} {(done.Count == 0 ? 0 : 100 * done.Count(s => s.Winners.Length > 1) / done.Count),5}%   {(colonies == 0 ? 0 : 100 * played.Sum(s => s.FullColonies) / colonies),19}%   {(young == 0 ? 0 : played.Sum(s => s.YoungInhabitants) / young),25}   {(done.Count == 0 ? 0 : done.Sum(s => s.IncomeAtEnd) / done.Count),15}   {played.Average(s => s.Battles),7:0.0}");
                }
    }

    static Season Play(string mode, int clans, int seed, int population, int[]? victory)
    {
        var now = DateTimeOffset.Parse("2026-11-28T12:00:00Z");
        var g = Modes.Create(RealStarMap.Generate(seed, clans), now, true, mode);
        foreach (var clan in g.Clans) clan.Ai = true;
        g.ReconEntropy = Convert.ToHexString(Enumerable.Repeat((byte)(seed % 251 + 1), 32).ToArray());
        if (victory is not null) g.Victory = new VictoryRule(victory[0], victory[1], victory.Length > 2 ? victory[2] : 0).Validated();
        // Rule 0 is the flat 15 credits a colony earned before inhabitants, for comparison.
        g.PopulationVersion = population;
        if (population == 0) foreach (var star in g.Stars) star.Inhabitants = 0;
        var homes = g.Stars.Where(s => s.Owner is not null).Select(s => s.Id).ToHashSet();
        var battles = 0;
        for (var turn = 0; turn < 150 && g.Winner is null; turn++)
        {
            var seen = g.Clans[0].Reports.Count(r => r.Contains("attle at"));
            Rules.Resolve(g, g.Deadline);
            battles += Math.Max(0, g.Clans[0].Reports.Count(r => r.Contains("attle at")) - seen);
        }
        var held = g.Stars.Where(s => s.Owner is not null).ToList(); var youngColonies = held.Where(s => !homes.Contains(s.Id)).ToList();
        var winners = g.Winners?.ToArray() ?? [];
        return new(Seasons.TurnsPlayed(g), g.Winner is not null, winners, held.Count, held.Count(s => s.Inhabitants >= Population.Capacity),
            youngColonies.Sum(s => s.Inhabitants), youngColonies.Count, winners.Length == 0 ? 0 : Rules.Observe(g, winners[0]).NextIncome, battles);
    }
}
