; Optima Agent Installer
; Config is appended to the end of this exe by the server at download time.
; Format: ...exe bytes...[marker]{"property_key":"...","server_url":"..."}

#define MyAppName "Optima Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Sclera Technologies"
#define MyAppURL "https://optima.sclera.com"

[Setup]
AppId={{8F4E2A1B-3C5D-4E6F-A7B8-9D0E1F2A3B4C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\Optima\agent
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=optima-agent-setup
SetupIconFile=optima.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardImageFile=installer-wizard.bmp
WizardSmallImageFile=installer-small.bmp
PrivilegesRequired=admin
UninstallDisplayIcon={app}\optima-agent.exe
VersionInfoVersion=1.0.0.0
VersionInfoCompany=Sclera Technologies
VersionInfoDescription=Optima HAM/SAM Monitoring Agent Setup
VersionInfoCopyright=Copyright 2024-2026 Sclera Technologies, Inc.
VersionInfoProductName=Optima Agent
VersionInfoProductVersion=1.0.0.0
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to Optima Agent Setup
WelcomeLabel2=This will install the Optima HAM/SAM monitoring agent on your computer.%n%nThe agent automatically discovers installed software, hardware specifications, and reports them to your property server.%n%nClick Next to continue.
FinishedHeadingLabel=Installation Complete
FinishedLabel=The Optima Agent has been successfully installed and is now running in the background.%n%nThe agent will automatically scan your system daily and on startup.%n%nYou can safely close this window.

[Files]
Source: "dist\optima-agent-win.exe"; DestDir: "{app}"; DestName: "optima-agent.exe"; Flags: ignoreversion

[Run]
Filename: "schtasks"; Parameters: "/Delete /TN ""OptimaAgent"" /F"; Flags: runhidden; StatusMsg: "Configuring agent service..."
Filename: "schtasks"; Parameters: "/Delete /TN ""OptimaAgentStartup"" /F"; Flags: runhidden; StatusMsg: "Configuring agent service..."
Filename: "schtasks"; Parameters: "/Create /TN ""OptimaAgent"" /TR """"""{app}\optima-agent.exe"""""" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /F"; Flags: runhidden; StatusMsg: "Creating daily scan schedule..."
Filename: "schtasks"; Parameters: "/Create /TN ""OptimaAgentStartup"" /TR """"""{app}\optima-agent.exe"""""" /SC ONSTART /RU SYSTEM /RL HIGHEST /F"; Flags: runhidden; StatusMsg: "Creating startup task..."
Filename: "{app}\optima-agent.exe"; Parameters: "--once"; Flags: runhidden nowait; StatusMsg: "Running initial inventory scan..."

[UninstallRun]
Filename: "schtasks"; Parameters: "/Delete /TN ""OptimaAgent"" /F"; Flags: runhidden; RunOnceId: "RemoveDaily"
Filename: "schtasks"; Parameters: "/Delete /TN ""OptimaAgentStartup"" /F"; Flags: runhidden; RunOnceId: "RemoveStartup"
Filename: "taskkill"; Parameters: "/F /IM optima-agent.exe"; Flags: runhidden; RunOnceId: "KillAgent"

[UninstallDelete]
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\optima-agent.exe"
Type: dirifempty; Name: "{app}"
Type: dirifempty; Name: "{autopf}\Optima"

[Code]
var
  ResultCode: Integer;

const
  CONFIG_MARKER = '---OPTIMA-CONFIG---';

function InitializeSetup(): Boolean;
begin
  Exec('taskkill', '/F /IM optima-agent.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

function ReadConfigFromExeTail(): String;
var
  ExePath: String;
  AllData: AnsiString;
  MarkerPos: Integer;
begin
  Result := '';
  ExePath := ExpandConstant('{srcexe}');
  if LoadStringFromFile(ExePath, AllData) then
  begin
    MarkerPos := Pos(CONFIG_MARKER, String(AllData));
    if MarkerPos > 0 then
    begin
      Result := Copy(String(AllData), MarkerPos + Length(CONFIG_MARKER), Length(AllData));
      Result := Trim(Result);
    end;
  end;
end;

function ExtractJsonValue(const Json, Key: String): String;
var
  SearchStr: String;
  StartPos, EndPos: Integer;
begin
  Result := '';
  SearchStr := '"' + Key + '":"';
  StartPos := Pos(SearchStr, Json);
  if StartPos > 0 then
  begin
    StartPos := StartPos + Length(SearchStr);
    EndPos := StartPos;
    while (EndPos <= Length(Json)) and (Json[EndPos] <> '"') do
      EndPos := EndPos + 1;
    Result := Copy(Json, StartPos, EndPos - StartPos);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigJson: String;
  PropKey: String;
  ServerUrl: String;
  ConfigPath: String;
  ConfigContent: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigJson := ReadConfigFromExeTail();
    PropKey := ExtractJsonValue(ConfigJson, 'property_key');
    ServerUrl := ExtractJsonValue(ConfigJson, 'server_url');

    if ServerUrl = '' then
      ServerUrl := 'https://optima.sclera.com';

    ConfigPath := ExpandConstant('{app}\config.json');
    ConfigContent := '{' + #13#10 +
      '  "property_key": "' + PropKey + '",' + #13#10 +
      '  "server_url": "' + ServerUrl + '",' + #13#10 +
      '  "agent_id": null,' + #13#10 +
      '  "interval_hours": 24,' + #13#10 +
      '  "installed_at": "' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':') + '"' + #13#10 +
      '}';
    SaveStringToFile(ConfigPath, ConfigContent, False);
  end;
end;
