using Deepfield.Api;

public static class PreviewStorageChecks
{
    public static void Run()
    {
        var count=0;
        void Check(bool result,string message){if(!result)throw new Exception(message);count++;}
        void Reject(Func<string> action,string expected){try{action();throw new Exception("Expected preview rejection");}catch(InvalidOperationException e){Check(e.Message.Contains(expected),expected);}}
        Reject(()=>PreviewStorage.Resolve(true,true,"Host=127.0.0.1;Database=do_not_connect",null),"ConnectionStrings:Deepfield");
        Reject(()=>PreviewStorage.Resolve(true,true," ",null),"ConnectionStrings:Deepfield");
        Reject(()=>PreviewStorage.Resolve(true,true,null,"existing-campaign.json"),"SavePath");
        Reject(()=>PreviewStorage.Resolve(true,false,null,null),"Development");
        var first=PreviewStorage.Resolve(true,true,null,null);var second=PreviewStorage.Resolve(true,true,null,null);
        Check(first!=second&&!File.Exists(first)&&!Directory.Exists(Path.GetDirectoryName(first)),"Fresh preview path has no storage side effects");
        Check(Path.GetDirectoryName(first)!.StartsWith(Path.GetTempPath())&&Path.GetFileName(first)=="campaign.json","Preview uses a disposable file location");
        Check(PreviewStorage.Resolve(false,true,"normal database","normal-save.json")=="normal-save.json","Non-preview configuration unchanged");
        Check(PreviewStorage.Resolve(false,false,"normal database",null)=="data/campaign.json","Non-preview default unchanged");
        Console.WriteLine($"{count} preview storage policy checks passed.");
    }
}
