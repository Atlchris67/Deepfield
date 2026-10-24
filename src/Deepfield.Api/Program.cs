using System.Security.Cryptography;
using System.Text;
using Deepfield.Api;
using Deepfield.Engine;

var builder=WebApplication.CreateBuilder(args);
var connection=builder.Configuration.GetConnectionString("Deepfield");
var savePath=PreviewStorage.Resolve(builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Environment.IsDevelopment(),connection,builder.Configuration["SavePath"]);
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=16*1024);
var keys = new[]{builder.Configuration["Teams:0:Key"],builder.Configuration["Teams:1:Key"]};
if(keys.Any(k=>string.IsNullOrWhiteSpace(k) || k.Length<24) || keys[0]==keys[1])
    throw new InvalidOperationException("Set distinct Teams__0__Key and Teams__1__Key environment values (at least 24 characters).");
var localTest=LocalTurns.Enabled(builder.Environment.IsDevelopment(),builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Configuration.GetValue<bool>("LocalTest"));
Game NewGame()=>string.IsNullOrEmpty(connection) && builder.Environment.IsDevelopment()
    ? Rules.CreateFromMap(RealStarMap.Generate(),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),builder.Configuration.GetValue("CombatVersion",0))
    : Rules.Create(builder.Configuration.GetValue("Seed",42017),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),builder.Configuration.GetValue("CombatVersion",0));
IGameStore store;
GeneratedCampaigns? generatedCampaigns = null;

if(!string.IsNullOrEmpty(connection))
{
    var pg=new PostgresGameStore(connection,NewGame); await pg.Initialize(); store=pg;
}
else
{
    if(!builder.Environment.IsDevelopment()) throw new InvalidOperationException("PostgreSQL connection required outside Development.");
    store=new FileGameStore(savePath,NewGame);
    generatedCampaigns=new GeneratedCampaigns(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(savePath))!,"generated-campaigns"));
    builder.Services.AddSingleton(generatedCampaigns);
    builder.Services.AddHostedService<GeneratedTurnWorker>();
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
bool CanAccelerate(HttpContext c)=>LocalTurns.Allowed(localTest,c);
IGameStore CampaignStore(HttpContext c)
{
    var id=c.Request.Headers["X-Deepfield-Campaign"].ToString();
    return string.IsNullOrEmpty(id)?store:generatedCampaigns?.Existing(id) ?? throw new RuleException("Generated campaigns require a local file store.");
}
IResult PreviewStarMap(HttpContext c,StarMapPreviewRequest body)
{
    if(!CanAccelerate(c)) return Results.NotFound();
    if(!body.Real) throw new RuleException("New campaigns use cataloged real star systems. Existing fictional campaigns remain available from their saved files.");
    return Results.Ok(RealStarMap.Generate());
}
app.MapGet("/health",()=>Results.Ok(new{status="ok"}));
app.MapGet("/api/campaign",(Delegate)(Func<HttpContext,Task<IResult>>)(async c=>Results.Ok(new{campaign=await CampaignStore(c).Execute(g=>Rules.Observe(g,Team(c)),false),localTest=CanAccelerate(c)})));
app.MapPut("/api/orders",async(HttpContext c,Submission body)=>Results.Ok(new{revision=await CampaignStore(c).Execute(g=>
{
    if(g.Clans[Team(c)].Ai) throw new RuleException("This clan is AI-controlled.");
    return Rules.Submit(g,Team(c),body,DateTimeOffset.UtcNow);
})}));
app.MapPost("/api/messages",async(HttpContext c,BoardPost body)=>Results.Ok(await CampaignStore(c).Execute(g=>
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
    return Results.Ok(await CampaignStore(c).Execute(g=>LocalTurns.Resolve(g,body.Turn,DateTimeOffset.UtcNow)));
});
app.MapPost("/api/local/star-map/preview",PreviewStarMap);
app.MapPost("/api/local/campaigns",async(HttpContext c,StartGeneratedCampaign body)=>
{
    if(!CanAccelerate(c) || generatedCampaigns is null) return Results.NotFound();
    if(body.Preview is null || body.GeneratorVersion!=StarMapGenerator.CurrentVersion) throw new RuleException("Preview a current star map before starting a campaign.");
    if(!body.Preview.Real) throw new RuleException("New campaigns use cataloged real star systems. Existing fictional campaigns remain available from their saved files.");
    var map=RealStarMap.Generate();
    var game=await generatedCampaigns.Start(body.Id,map,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),builder.Configuration.GetValue("CombatVersion",0),body.LogisticsVersion,body.IndustrialFocus);
    return Results.Ok(new {id=body.Id,campaign=Rules.Observe(game,Team(c))});
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
public record BoardPost(string Id,string Author,string Text);
public record Advance(int Turn);
public record StarMapPreviewRequest(int Seed,int SystemCount,int Width,int Height,int MinimumSeparation,int NearestNeighborLinks,int PlayerCount,bool Real=false);
public record StartGeneratedCampaign(string Id,int GeneratorVersion,StarMapPreviewRequest? Preview,int LogisticsVersion=0,int[]? IndustrialFocus=null);
