; ============================================================================
;  Optima Property Server — Windows Installer (Inno Setup 6)
;  Installs Node.js, property server code, prompts for key, starts service.
; ============================================================================

#define MyAppName "Optima Property Server"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Sclera Technologies"
#define MyAppURL "https://optima.sclera.com"

[Setup]
AppId={{B8A7F2E1-4C3D-4A9B-8E6F-1D2C3B4A5E6F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Optima Property Server
DefaultGroupName=Optima
OutputDir=dist
OutputBaseFilename=optima-property-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
LicenseFile=
SetupIconFile=..\deploy\agent\optima.ico
UninstallDisplayIcon={app}\optima.ico
WizardImageFile=..\deploy\agent\installer-wizard.bmp
WizardSmallImageFile=..\deploy\agent\installer-small.bmp

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Backend code + node_modules
Source: "payload\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
; Icon
Source: "..\deploy\agent\optima.ico"; DestDir: "{app}"; Flags: ignoreversion
; Node.js installer (bundled)
Source: "node-installer\node-v18*.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsNodeJS

[Icons]
Name: "{group}\Optima Property Server"; Filename: "{app}\backend\property-server.js"; IconFilename: "{app}\optima.ico"
Name: "{group}\Uninstall Optima"; Filename: "{uninstallexe}"

[Run]
; Install Node.js if needed
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\node-v18.20.8-x64.msi"" /qn /norestart"; StatusMsg: "Installing Node.js..."; Check: NeedsNodeJS; Flags: waituntilterminated
; Start the property server as a service via nssm or as a scheduled task
Filename: "cmd.exe"; Parameters: "/c schtasks /Create /TN ""OptimaProperty"" /TR ""\""{code:GetNodePath}\"" \""{app}\backend\property-server.js\"""" /SC ONSTART /RU SYSTEM /RL HIGHEST /F"; StatusMsg: "Creating startup task..."; Flags: runhidden waituntilterminated
Filename: "cmd.exe"; Parameters: "/c schtasks /Create /TN ""OptimaPropertyDaily"" /TR ""\""{code:GetNodePath}\"" \""{app}\backend\property-server.js\"""" /SC DAILY /ST 00:05 /RU SYSTEM /RL HIGHEST /F"; StatusMsg: "Creating daily task..."; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "cmd.exe"; Parameters: "/c schtasks /Delete /TN ""OptimaProperty"" /F"; Flags: runhidden; RunOnceId: "DelTask1"
Filename: "cmd.exe"; Parameters: "/c schtasks /Delete /TN ""OptimaPropertyDaily"" /F"; Flags: runhidden; RunOnceId: "DelTask2"
Filename: "cmd.exe"; Parameters: "/c taskkill /F /FI ""WINDOWTITLE eq Optima*"" >nul 2>&1"; Flags: runhidden; RunOnceId: "KillProc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  PropertyKeyPage: TInputQueryWizardPage;

function NeedsNodeJS: Boolean;
var
  ResultCode: Integer;
begin
  Result := not Exec('cmd.exe', '/c node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0);
end;

function GetNodePath(Param: String): String;
begin
  Result := ExpandConstant('{pf}\nodejs\node.exe');
  if not FileExists(Result) then
    Result := 'node';
end;

procedure InitializeWizard;
begin
  PropertyKeyPage := CreateInputQueryPage(wpSelectDir,
    'Property Key',
    'Enter your Optima property key',
    'Get your key from https://optima.sclera.com → Properties → Key');
  PropertyKeyPage.Add('Property Key:', False);
  PropertyKeyPage.Values[0] := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Key: String;
begin
  Result := True;
  if CurPageID = PropertyKeyPage.ID then
  begin
    Key := Trim(PropertyKeyPage.Values[0]);
    if Key = '' then
    begin
      MsgBox('Property key cannot be empty.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NodePath: String;
  Key: String;
  EnvContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    { Write .env file with the property key (after files are copied) }
    Key := Trim(PropertyKeyPage.Values[0]);
    EnvContent := 'PROPERTY_KEY=' + Key + #13#10 +
                  'CENTRAL_SERVER_URL=https://optima.sclera.com' + #13#10 +
                  'PORT=5000' + #13#10;
    SaveStringToFile(ExpandConstant('{app}\backend\.env'), EnvContent, False);

    { Start the property server immediately }
    NodePath := GetNodePath('');
    Exec('cmd.exe', '/c start "" "' + NodePath + '" "' + ExpandConstant('{app}\backend\property-server.js') + '"',
      ExpandConstant('{app}\backend'), SW_HIDE, ewNoWait, ResultCode);
  end;
end;
