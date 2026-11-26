using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Deepfield.Api;
using Deepfield.Engine;

var builder=WebApplication.CreateBuilder(args);
var connection=builder.Configuration.GetConnectionString("Deepfield");
var savePath=PreviewStorage.Resolve(builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Environment.IsDevelopment(),connection,builder.Configuration["SavePath"]);
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=16*1024);
// "keys" is the original shared clan-key sign-in, kept for local development and existing saves.
// "accounts" is personal sign-in for hosted play and is the default outside Development.
var authMode=(builder.Configuration["Auth:Mode"]??(builder.Environment.IsDevelopment()?"keys":"accounts")).Trim().ToLowerInvariant();
if(authMode is not ("keys" or "accounts")) throw new InvalidOperationException("Auth__Mode must be 'keys' or 'accounts'.");
var keys = new[]{builder.Configuration["Teams:0:Key"],builder.Configuration["Teams:1:Key"]};
if(authMode=="keys" && (keys.Any(k=>string.IsNullOrWhiteSpace(k) || k.Length<24) || keys[0]==keys[1]))
    throw new InvalidOperationException("Set distinct Teams__0__Key and Teams__1__Key environment values (at least 24 characters).");
var localTest=LocalTurns.Enabled(builder.Environment.IsDevelopment(),builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Configuration.GetValue<bool>("LocalTest"));
// A newly created hosted campaign with personal accounts starts on the real-star map unless LegacyMap=true.
// An existing database row is never replaced, so this affects only a campaign that does not exist yet.
Game NewGame()=>(string.IsNullOrEmpty(connection) && builder.Environment.IsDevelopment()) || (authMode=="accounts" && !builder.Configuration.GetValue("LegacyMap",false))
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
AccountAccess? access=null;
if(authMode=="accounts")
{
    IAccountStore accounts;
    if(!string.IsNullOrEmpty(connection)) { var pgAccounts=new PostgresAccountStore(connection); await pgAccounts.Initialize(); accounts=pgAccounts; }
    else accounts=new FileAccountStore(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(savePath))!,"accounts.json"));
    var clanNames=await store.Execute(g=>g.Clans.Select(clan=>clan.Name).ToArray(),false);
    access=new AccountAccess(accounts,builder.Configuration["Owner:SetupKey"],clanNames,builder.Environment.IsDevelopment());
}
// Sign-in, setup and invitation attempts are limited per client address.
var authPermits=builder.Configuration.GetValue("Auth:AttemptsPerMinute",20);
builder.Services.AddRateLimiter(o=>
{
    o.RejectionStatusCode=429;
    o.AddPolicy(AccountAccess.RateLimitPolicy,c=>RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString()??"unknown",
        _=>new FixedWindowRateLimiterOptions{PermitLimit=authPermits,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));
});
// Hosted behind a platform proxy that terminates HTTPS: trust its forwarded scheme and client address.
// Enable only when the app cannot be reached except through that proxy.
var trustProxy=builder.Configuration.GetValue("Proxy:TrustForwardedHeaders",false);
if(trustProxy) builder.Services.Configure<ForwardedHeadersOptions>(o=>
{
    o.ForwardedHeaders=ForwardedHeaders.XForwardedFor|ForwardedHeaders.XForwardedProto;
    o.ForwardLimit=builder.Configuration.GetValue("Proxy:ForwardLimit",1);
    o.KnownIPNetworks.Clear(); o.KnownProxies.Clear();
});
var requireHttps=builder.Configuration.GetValue("Https:Require",authMode=="accounts" && !builder.Environment.IsDevelopment());
builder.Services.AddHttpsRedirection(o=>{o.HttpsPort=443;o.RedirectStatusCode=StatusCodes.Status308PermanentRedirect;});
var app=builder.Build();
if(trustProxy) app.UseForwardedHeaders();
if(requireHttps)
{
    app.UseHsts();
    // Platform health probes usually arrive over plain HTTP from inside the network.
    app.UseWhen(c=>!c.Request.Path.StartsWithSegments("/health"),branch=>branch.UseHttpsRedirection());
}
app.Use(async(ctx,next)=>
{
    ctx.Response.Headers["Cache-Control"]="no-store";
    ctx.Response.Headers["X-Content-Type-Options"]="nosniff";
    ctx.Response.Headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
    try
    {
        if(ctx.Request.Path.StartsWithSegments("/api"))
        {
            if(access is not null) { if(!await access.Authorize(ctx)) return; }
            else if(!ctx.Request.Path.Equals("/api/public/state"))
            {
                var token=ctx.Request.Headers.Authorization.ToString();
                var team=Array.FindIndex(keys,k=>CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token),Encoding.UTF8.GetBytes("Bearer "+k)));
                if(team<0) { ctx.Response.StatusCode=401; return; }
                ctx.Items["team"]=team;
            }
        }
        await next(ctx);
    }
    catch(RuleException ex) { ctx.Response.StatusCode=409; await ctx.Response.WriteAsJsonAsync(new{error=ex.Message}); }
    catch(AccountException ex) { ctx.Response.StatusCode=ex.Status; await ctx.Response.WriteAsJsonAsync(new{error=ex.Message}); }
});
app.UseRateLimiter();
if(access is not null) access.Map(app);
else app.MapGet("/api/public/state",()=>Results.Ok(new{mode="keys"}));
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
// Readiness also proves the campaign store (and so the database) answers.
app.MapGet("/health/ready",async()=>Results.Ok(new{status="ok",turn=await store.Execute(g=>g.Turn,false)}));
app.MapGet("/api/campaign",(Delegate)(Func<HttpContext,Task<IResult>>)(async c=>Results.Ok(new{campaign=await CampaignStore(c).Execute(g=>Rules.Observe(g,Team(c)),false),localTest=CanAccelerate(c)})));
app.MapPut("/api/orders",async(HttpContext c,Submission body)=>Results.Ok(new{revision=await CampaignStore(c).Execute(g=>
{
    if(g.Clans[Team(c)].Ai) throw new RuleException("This clan is AI-controlled.");
    return Rules.Submit(g,Team(c),body,DateTimeOffset.UtcNow);
})}));
app.MapPost("/api/messages",async(HttpContext c,BoardPost body)=>Results.Ok(await CampaignStore(c).Execute(g=>
{
    // With personal accounts the author is the signed-in player, never a name typed by the client.
    var author=c.Items["account"] is Account signedIn?signedIn.DisplayName:body.Author;
    if(string.IsNullOrWhiteSpace(body.Id) || body.Id.Length>80 || string.IsNullOrWhiteSpace(author) || author.Length>40 || string.IsNullOrWhiteSpace(body.Text) || body.Text.Length>2000) throw new RuleException("Provide ID, author (1–40) and message (1–2000 characters).");
    var messages=g.Clans[Team(c)].Messages; var prior=messages.Find(m=>m.Id==body.Id);
    if(prior!=null) { if(prior.Text!=body.Text || prior.Author!=author) throw new RuleException("Message ID already used."); return prior; }
    var message=new Message(body.Id,author,body.Text,DateTimeOffset.UtcNow); messages.Add(message);
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
    var game=await generatedCampaigns.Start(body.Id,map,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),body.CombatVersion??builder.Configuration.GetValue("CombatVersion",0),body.LogisticsVersion,body.IndustrialFocus);
    return Results.Ok(new {id=body.Id,campaign=Rules.Observe(game,Team(c))});
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
public record BoardPost(string Id,string? Author,string Text);
public record Advance(int Turn);
public record StarMapPreviewRequest(int Seed,int SystemCount,int Width,int Height,int MinimumSeparation,int NearestNeighborLinks,int PlayerCount,bool Real=false);
public record StartGeneratedCampaign(string Id,int GeneratorVersion,StarMapPreviewRequest? Preview,int LogisticsVersion=0,int[]? IndustrialFocus=null,int? CombatVersion=null);
