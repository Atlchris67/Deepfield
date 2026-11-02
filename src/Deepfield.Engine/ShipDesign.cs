namespace Deepfield.Engine;

/// <summary>One active, clan-wide package for each typed hull. Saved fleets remain five hull counts.</summary>
public static class ShipDesign
{
    public static readonly string[] Packages = ["standard", "assault", "reinforced"];
    public static string[] Defaults() => ["standard", "standard", "standard", "standard", "standard"];
    public static int Index(string? package)
    {
        var index = Array.IndexOf(Packages, package);
        return index >= 0 ? index : throw new RuleException("Unknown ship package.");
    }
    public const int AdoptionCredits = 12;
    public static int[] MaterialCost(string package) => package switch
    {
        "assault" => [0, 0, 2, 1, 0, 0],
        "reinforced" => [2, 1, 0, 0, 0, 0],
        "standard" => [0, 0, 0, 0, 0, 0],
        _ => throw new RuleException("Unknown ship package.")
    };
}
