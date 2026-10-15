using System.Net;
using System.Security.Cryptography;
using System.Text;
using Deepfield.Api;
using Deepfield.Engine;

var builder=WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=16*1024);
var keys = new[]{builder.Configuration["Teams:0:Key"],builder.Configuration["Teams:1:Key"]};
if(keys.Any(k=>string.IsNullOrWhiteSpace(k) || k.Length<24) || keys[0]==keys[1])
    throw new InvalidOperationException("Set distinct Teams__0__Key and Teams__1__Key environment values (at least 24 characters).");
var localTest=builder.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("LocalTest");
Game NewGame()=>Rules.Create(builder.Configuration.GetValue("Seed",42017),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0));
IGameStore store;
var connection=builder.Configuration.GetConnectionString("Deepfield");
if(!string.IsNullOrEmpty(connection))
{
    var pg=new PostgresGameStore(connection,NewGame); await pg.Initialize(); store=pg;
}
else
{
    if(!builder.Environment.IsDevelopment()) throw new InvalidOperationException("PostgreSQL connection required outside Development.");
    store=new FileGameStore(builder.Configuration["SavePath"] ?? "data/campaign.json",NewGame);
}
builder.Services.AddSingleton(store);
builder.Services.AddHostedService<TurnWorker>();
var app=builder.Build();
app.Use(async(ctx,next)=>
{
    ctx.Response.Headers["Cache-Control"]="no-store";
    ctx.Response.Headers["X-Content-Type-Options"]="nosniff";
    ctx.Response.Headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
    if(ctx.Request.Path.StartsWithSegments("/api"))
    {
        var token=ctx.Request.Headers.Authorization.ToString();
        var team=Array.FindIndex(keys,k=>CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token),Encoding.UTF8.GetBytes("Bearer "+k)));
        if(team<0) { ctx.Response.StatusCode=401; return; }
        ctx.Items["team"]=team;
    }
    try { await next(ctx); }
    catch(RuleException ex) { ctx.Response.StatusCode=409; await ctx.Response.WriteAsJsonAsync(new{error=ex.Message}); }
});
int Team(HttpContext c)=>(int)c.Items["team"]!;
bool CanAccelerate(HttpContext c)=>localTest && c.Connection.RemoteIpAddress is {} ip && IPAddress.IsLoopback(ip)
    && (c.Request.Host.Host is "localhost" or "127.0.0.1" or "[::1]")
    && !c.Request.Headers.ContainsKey("Forwarded") && !c.Request.Headers.ContainsKey("X-Forwarded-For") && !c.Request.Headers.ContainsKey("CF-Connecting-IP");
app.MapGet("/health",()=>Results.Ok(new{status="ok"}));
app.MapGet("/api/campaign",async(HttpContext c, IGameStore db)=>Results.Ok(new{campaign=await db.Execute(g=>Rules.Observe(g,Team(c)),false),localTest=CanAccelerate(c)}));
app.MapPut("/api/orders",async(HttpContext c,Submission body)=>Results.Ok(new{revision=await store.Execute(g=>
{
    if(g.Clans[Team(c)].Ai) throw new RuleException("This clan is AI-controlled.");
    return Rules.Submit(g,Team(c),body,DateTimeOffset.UtcNow);
})}));
app.MapPost("/api/messages",async(HttpContext c,BoardPost body)=>Results.Ok(await store.Execute(g=>
{
    if(string.IsNullOrWhiteSpace(body.Id) || body.Id.Length>80 || string.IsNullOrWhiteSpace(body.Author) || body.Author.Length>40 || string.IsNullOrWhiteSpace(body.Text) || body.Text.Length>2000) throw new RuleException("Provide ID, author (1–40) and message (1–2000 characters).");
    var messages=g.Clans[Team(c)].Messages; var prior=messages.Find(m=>m.Id==body.Id);
    if(prior!=null) { if(prior.Text!=body.Text || prior.Author!=body.Author) throw new RuleException("Message ID already used."); return prior; }
    var message=new Message(body.Id,body.Author,body.Text,DateTimeOffset.UtcNow); messages.Add(message);
    if(messages.Count>200) messages.RemoveAt(0); return message;
})));
app.MapPost("/api/local/advance",async(HttpContext c,Advance body)=>
{
    if(!CanAccelerate(c)) return Results.NotFound();
    return Results.Ok(await store.Execute(g=>
    {
        if(g.Turn!=body.Turn) return new{advanced=false,turn=g.Turn};
        g.Deadline=DateTimeOffset.UtcNow; var advanced=Rules.Resolve(g,DateTimeOffset.UtcNow); return new{advanced,turn=g.Turn};
    }));
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
public record BoardPost(string Id,string Author,string Text);
public record Advance(int Turn);
