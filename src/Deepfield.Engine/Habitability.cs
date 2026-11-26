using System.Buffers.Binary;
using System.Security.Cryptography;

namespace Deepfield.Engine;

/// <summary>Fictional system-level environmental stresses (0–100), not astronomical measurements.</summary>
public sealed record ColonyEnvironment(int ThermalStress, int GravityStress, int RadiationStress);

/// <summary>Only attached to a dated, successful Deep scout report. Null members indicate incomplete data.</summary>
public sealed record HabitabilityFactors(int? ThermalStress, int? GravityStress, int? RadiationStress);

public static class Habitability
{
    internal static ColonyEnvironment Generate(string privateCampaignEntropy, int systemId, bool homeworld)
    {
        Span<byte> key = stackalloc byte[8];
        // Domain-separate these draws from other uses of campaign entropy.
        "hab1"u8.CopyTo(key);
        BinaryPrimitives.WriteInt32LittleEndian(key[4..], systemId);
        var values = HMACSHA256.HashData(Convert.FromHexString(privateCampaignEntropy), key);
        // Favor both starting locations without making every home identical or constraining other systems.
        var maximum = homeworld ? 30 : 100;
        return new(Stress(values[0], maximum), Stress(values[1], maximum), Stress(values[2], maximum));
    }

    private static int Stress(byte value, int maximum) => value * (maximum + 1) / 256;

    // 50% weight on the most severe factor, 50% on the mean of all three.
    // Advisory only: no colony, turn-resolution, or economy rule reads this score.
    public static int Score(ColonyEnvironment environment)
    {
        var worst = Math.Max(environment.ThermalStress, Math.Max(environment.GravityStress, environment.RadiationStress));
        var sum = environment.ThermalStress + environment.GravityStress + environment.RadiationStress;
        return 100 - (3 * worst + sum + 3) / 6;
    }
}
