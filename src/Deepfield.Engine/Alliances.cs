namespace Deepfield.Engine;

/// <summary>
/// An alliance between two clans. It is in force from turn <see cref="Since"/> and, once either clan has given notice,
/// up to but not including turn <see cref="Ends"/>.
/// </summary>
public sealed record Pact(int A, int B, int Since, int? Ends = null);

/// <summary>
/// Alliances (owner decisions, 2026-11-28), for seasons with three or four clans.
/// <para>Forming: one clan offers and the other accepts by offering back. The alliance starts with the next turn.</para>
/// <para>Ending: either clan gives notice. The alliance still holds for this turn and the next, so an ally is never attacked by surprise.</para>
/// <para>Sharing: allied fleets do not fight and cannot take each other's colonies, and each ally sees what the other sees.
/// Credits, materials, ships, orders and scout reports stay separate.</para>
/// <para>Winning: when a clan wins, the clans allied with it at that moment share the win.</para>
/// Alliances are between two clans at a time: an ally's ally is not an ally. Everyone can see who is allied.
/// The computer player never offers or accepts an alliance.
/// </summary>
public static class Alliances
{
    public static bool Available(Game g) => g.Clans.Count > 2;

    /// <summary>True when the two clans are allied for the resolution of the given turn.</summary>
    public static bool Allied(Game g, int a, int b, int turn) => a != b && g.Pacts.Any(p => Between(p, a, b) && p.Since <= turn && (p.Ends is null || turn < p.Ends));
    public static bool Allied(Game g, int a, int b) => Allied(g, a, b, g.Turn);

    /// <summary>Two different clans that are not allied this turn fight when they meet.</summary>
    public static bool Hostile(Game g, int a, int b) => a != b && !Allied(g, a, b);

    public static IEnumerable<int> Allies(Game g, int team) => Enumerable.Range(0, g.Clans.Count).Where(other => Allied(g, team, other));

    static bool Between(Pact p, int a, int b) => (p.A, p.B) == (Math.Min(a, b), Math.Max(a, b));
    static Pact? Current(Game g, int a, int b) => g.Pacts.FirstOrDefault(p => Between(p, a, b) && (p.Ends is null || g.Turn < p.Ends));

    static void Check(Game g, int team, int other)
    {
        if (!Available(g)) throw new RuleException("Alliances need a season with three or four clans.");
        if (team < 0 || team >= g.Clans.Count || other < 0 || other >= g.Clans.Count || other == team) throw new RuleException("Choose another clan.");
        if (g.Winner is not null) throw new RuleException("This season is over.");
    }

    /// <summary>Offers an alliance, or accepts one the other clan has already offered.</summary>
    public static void Offer(Game g, int team, int other)
    {
        Check(g, team, other);
        if (g.Clans[team].Ai || g.Clans[other].Ai) throw new RuleException("A clan played by the computer does not make alliances.");
        if (Current(g, team, other) is { } pact)
            throw new RuleException(pact.Ends is null ? "Your clans are already allied." : $"That alliance is ending. A new one can be offered from turn {pact.Ends}.");
        var mine = g.Clans[team].AllianceOffers;
        if (g.Clans[other].AllianceOffers.Contains(team))
        {
            g.Clans[other].AllianceOffers.Remove(team); mine.Remove(other);
            g.Pacts.Add(new(Math.Min(team, other), Math.Max(team, other), g.Turn + 1));
            foreach (var clan in g.Clans) clan.Reports.Insert(0, $"{g.Clans[team].Name} and {g.Clans[other].Name} are allied from turn {g.Turn + 1}.");
            return;
        }
        if (mine.Contains(other)) throw new RuleException("Your clan has already offered that alliance.");
        mine.Add(other);
        g.Clans[team].Reports.Insert(0, $"Your clan offered an alliance to {g.Clans[other].Name}.");
        g.Clans[other].Reports.Insert(0, $"{g.Clans[team].Name} offers your clan an alliance.");
    }

    /// <summary>Takes back an offer that has not been accepted, or declines one received.</summary>
    public static void Decline(Game g, int team, int other)
    {
        Check(g, team, other);
        var withdrawn = g.Clans[team].AllianceOffers.Remove(other); var declined = g.Clans[other].AllianceOffers.Remove(team);
        if (!withdrawn && !declined) throw new RuleException("There is no alliance offer between your clans.");
        g.Clans[team].Reports.Insert(0, withdrawn ? $"Your clan withdrew its alliance offer to {g.Clans[other].Name}." : $"Your clan declined an alliance with {g.Clans[other].Name}.");
        g.Clans[other].Reports.Insert(0, withdrawn ? $"{g.Clans[team].Name} withdrew its alliance offer." : $"{g.Clans[team].Name} declined your clan's alliance offer.");
    }

    /// <summary>Gives notice. The alliance holds for this turn and the next.</summary>
    public static void End(Game g, int team, int other)
    {
        Check(g, team, other);
        var pact = Current(g, team, other) ?? throw new RuleException("Your clans are not allied.");
        if (pact.Ends is not null) throw new RuleException($"Notice has already been given. The alliance ends when turn {pact.Ends} begins.");
        var ends = g.Turn + 2;
        g.Pacts[g.Pacts.IndexOf(pact)] = pact with { Ends = ends };
        foreach (var clan in g.Clans) clan.Reports.Insert(0, $"{g.Clans[team].Name} gave notice to {g.Clans[other].Name}: their alliance ends when turn {ends} begins.");
    }

    /// <summary>Called when a turn has resolved: alliances whose notice has run out are dropped.</summary>
    public static void Expire(Game g)
    {
        foreach (var pact in g.Pacts.Where(p => p.Ends is not null && p.Ends <= g.Turn).ToList())
        {
            g.Pacts.Remove(pact);
            foreach (var clan in g.Clans) clan.Reports.Insert(0, $"The alliance between {g.Clans[pact.A].Name} and {g.Clans[pact.B].Name} has ended.");
        }
    }
}
