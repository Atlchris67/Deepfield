if (args.Contains("--recon")) { await ReconChecks.Run(); return; }
if (args.Contains("--ship-design")) { ShipDesignChecks.Run(); return; }
if (args.Contains("--typed")) { await TypedFleetChecks.Run(); return; }
await Checks.Run();
await ReconChecks.Run();
EconomyChecks.Run();
ShipDesignChecks.Run();
await TypedFleetChecks.Run();
PreviewStorageChecks.Run();
await LocalTurnChecks.Run();
PlanetChecks.Run();
StarMapChecks.Run();
await GeneratedCampaignChecks.Run();
await RealCampaignChecks.Run();
