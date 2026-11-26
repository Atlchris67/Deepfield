using System.Text.Json;
using Npgsql;

namespace Deepfield.Api;

// One small aggregate holding every account, invitation and session, mirroring the campaign store.
// That is ample for a family campaign; split it into tables before commercial scale.
public interface IAccountStore { Task<T> Execute<T>(Func<AccountBook, T> operation, bool write = true); }

public sealed class FileAccountStore(string path) : IAccountStore
{
    public async Task<T> Execute<T>(Func<AccountBook, T> operation, bool write = true)
    {
        var full = Path.GetFullPath(path); Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        FileStream? lease = null;
        for (var attempt = 0; lease == null; attempt++)
        {
            try { lease = new FileStream(full + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) when (attempt < 200) { await Task.Delay(25); }
        }
        using (lease)
        {
            var book = File.Exists(full) ? AccountCodec.Read(await File.ReadAllTextAsync(full)) : new AccountBook();
            var result = operation(book);
            if (write)
            {
                var temp = full + ".tmp";
                await using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                { await JsonSerializer.SerializeAsync(stream, book); stream.Flush(true); }
                if (File.Exists(full)) File.Replace(temp, full, null); else File.Move(temp, full);
            }
            return result;
        }
    }
}

public sealed class PostgresAccountStore(string connection) : IAccountStore
{
    public async Task Initialize()
    {
        await using var db = new NpgsqlConnection(connection); await db.OpenAsync();
        await using var schema = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS deepfield_accounts (id integer PRIMARY KEY CHECK (id=1), state jsonb NOT NULL)", db);
        await schema.ExecuteNonQueryAsync();
        await using var insert = new NpgsqlCommand("INSERT INTO deepfield_accounts VALUES (1, $1::jsonb) ON CONFLICT DO NOTHING", db);
        insert.Parameters.AddWithValue(JsonSerializer.Serialize(new AccountBook())); await insert.ExecuteNonQueryAsync();
    }
    public async Task<T> Execute<T>(Func<AccountBook, T> operation, bool write = true)
    {
        await using var db = new NpgsqlConnection(connection); await db.OpenAsync();
        if (!write)
        {
            // Session checks run on every request, so reads take no row lock.
            await using var peek = new NpgsqlCommand("SELECT state::text FROM deepfield_accounts WHERE id=1", db);
            return operation(AccountCodec.Read((string)(await peek.ExecuteScalarAsync() ?? throw new InvalidOperationException("Account book missing."))));
        }
        await using var tx = await db.BeginTransactionAsync();
        await using var read = new NpgsqlCommand("SELECT state::text FROM deepfield_accounts WHERE id=1 FOR UPDATE", db, tx);
        var book = AccountCodec.Read((string)(await read.ExecuteScalarAsync() ?? throw new InvalidOperationException("Account book missing.")));
        var result = operation(book);
        await using var save = new NpgsqlCommand("UPDATE deepfield_accounts SET state=$1::jsonb WHERE id=1", db, tx);
        save.Parameters.AddWithValue(JsonSerializer.Serialize(book)); await save.ExecuteNonQueryAsync();
        await tx.CommitAsync();
        return result;
    }
}

public static class AccountCodec
{
    public static AccountBook Read(string json)
    {
        var book = JsonSerializer.Deserialize<AccountBook>(json) ?? throw new InvalidOperationException("Invalid account book.");
        if (book.Schema != 1) throw new InvalidOperationException("Unsupported account book schema.");
        return book;
    }
}
