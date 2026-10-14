using System.Text.Json;
using Deepfield.Engine;
using Npgsql;

namespace Deepfield.Api;

public interface IGameStore { Task<T> Execute<T>(Func<Game,T> operation, bool write = true); }
public sealed class FileGameStore(string path, Func<Game> create) : IGameStore
{
    public async Task<T> Execute<T>(Func<Game,T> operation, bool write = true)
    {
        var full = Path.GetFullPath(path); Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        FileStream? lease = null;
        for(var attempt=0;lease==null;attempt++)
        {
            try { lease = new FileStream(full+".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch(IOException) when(attempt<200) { await Task.Delay(25); }
        }
        using(lease)
        {
            var exists = File.Exists(full);
            var game = exists ? JsonSerializer.Deserialize<Game>(await File.ReadAllTextAsync(full))! : create();
            if (game.Schema != 1) throw new InvalidOperationException("Unsupported save schema.");
            var result = operation(game);
            if(write || !exists)
            {
                var temp = full + ".tmp";
                await using(var stream = new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough))
                { await JsonSerializer.SerializeAsync(stream,game); stream.Flush(true); }
                if(exists) File.Replace(temp,full,null); else File.Move(temp,full);
            }
            return result;
        }
    }
}
public sealed class PostgresGameStore(string connection, Func<Game> create) : IGameStore
{
    public async Task Initialize()
    {
        await using var db = new NpgsqlConnection(connection); await db.OpenAsync();
        await using var schema = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS deepfield_campaign (id integer PRIMARY KEY CHECK (id=1), state jsonb NOT NULL)", db);
        await schema.ExecuteNonQueryAsync();
        await using var insert = new NpgsqlCommand("INSERT INTO deepfield_campaign VALUES (1, $1::jsonb) ON CONFLICT DO NOTHING",db);
        insert.Parameters.AddWithValue(JsonSerializer.Serialize(create())); await insert.ExecuteNonQueryAsync();
    }
    public async Task<T> Execute<T>(Func<Game,T> operation, bool write = true)
    {
        await using var db = new NpgsqlConnection(connection); await db.OpenAsync();
        await using var tx = await db.BeginTransactionAsync();
        await using var read = new NpgsqlCommand("SELECT state::text FROM deepfield_campaign WHERE id=1 FOR UPDATE",db,tx);
        var game=JsonSerializer.Deserialize<Game>((string)(await read.ExecuteScalarAsync() ?? throw new InvalidOperationException("Campaign missing.")))!;
        if(game.Schema!=1) throw new InvalidOperationException("Unsupported save schema.");
        var result=operation(game);
        if(write)
        {
            await using var save=new NpgsqlCommand("UPDATE deepfield_campaign SET state=$1::jsonb WHERE id=1",db,tx);
            save.Parameters.AddWithValue(JsonSerializer.Serialize(game)); await save.ExecuteNonQueryAsync();
        }
        await tx.CommitAsync(); return result;
    }
}
public sealed class TurnWorker(IGameStore store, ILogger<TurnWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(5));
        do
        {
            try { await store.Execute(g=>Rules.Resolve(g,DateTimeOffset.UtcNow)); }
            catch(Exception ex) { logger.LogError(ex,"Turn resolution failed; no successful commit. Will retry."); }
        } while(await timer.WaitForNextTickAsync(stoppingToken));
    }
}
