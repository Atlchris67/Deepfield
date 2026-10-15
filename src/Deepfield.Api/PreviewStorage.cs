namespace Deepfield.Api;

public static class PreviewStorage
{
    // Resolve before constructing any store or starting the turn worker.
    // A preview never inherits either a database or a caller's existing save.
    public static string Resolve(bool isolated, bool development, string? connection, string? savePath)
    {
        if (!isolated) return savePath ?? "data/campaign.json";
        if (!string.IsNullOrEmpty(connection))
            throw new InvalidOperationException("Isolated preview rejects ConnectionStrings:Deepfield. Remove inherited database configuration before starting this preview.");
        if (!development)
            throw new InvalidOperationException("Isolated preview requires Development.");
        if (!string.IsNullOrEmpty(savePath))
            throw new InvalidOperationException("Isolated preview rejects SavePath. It creates a fresh disposable file campaign automatically.");
        return Path.Combine(Path.GetTempPath(), "deepfield-preview-" + Guid.NewGuid().ToString("N"), "campaign.json");
    }
}
