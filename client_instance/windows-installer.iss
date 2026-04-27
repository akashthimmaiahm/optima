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
DefaultDirName={commonappdata}\Optima Property Server
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

[UninstallRun]
Filename: "cmd.exe"; Parameters: "/c schtasks /Delete /TN ""OptimaProperty"" /F"; Flags: runhidden; RunOnceId: "DelTask1"
Filename: "cmd.exe"; Parameters: "/c schtasks /Delete /TN ""OptimaPropertyDaily"" /F"; Flags: runhidden; RunOnceId: "DelTask2"
Filename: "cmd.exe"; Parameters: "/c taskkill /F /FI ""WINDOWTITLE eq Optima*"" >nul 2>&1"; Flags: runhidden; RunOnceId: "KillProc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  PropertyKeyPage: TInputQueryWizardPage;
  PortPage: TInputQueryWizardPage;
  ChosenPort: String;

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

function IsPortInUse(Port: String): Boolean;
var
  ResultCode: Integer;
  TmpFile: String;
  Content: AnsiString;
begin
  Result := False;
  TmpFile := ExpandConstant('{tmp}\portcheck.txt');
  Exec('cmd.exe', '/c netstat -an | findstr ":' + Port + ' " > "' + TmpFile + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if LoadStringFromFile(TmpFile, Content) then
  begin
    if Pos('LISTENING', String(Content)) > 0 then
      Result := True;
  end;
  DeleteFile(TmpFile);
end;

procedure InitializeWizard;
begin
  PropertyKeyPage := CreateInputQueryPage(wpSelectDir,
    'Property Key',
    'Enter your Optima property key',
    'Get your key from https://optima.sclera.com'#13#10'Navigate to Properties → Your Property → Key');
  PropertyKeyPage.Add('Property Key:', False);
  PropertyKeyPage.Values[0] := '';

  PortPage := CreateInputQueryPage(PropertyKeyPage.ID,
    'Server Port',
    'Choose the port for the property server',
    'Default is 5000. If another service is already using port 5000,'#13#10'enter a different port (e.g. 5001, 5002).');
  PortPage.Add('Port:', False);
  PortPage.Values[0] := '5000';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Key, Port: String;
  PortNum: Integer;
  KillChoice: Integer;
  ResultCode: Integer;
begin
  Result := True;

  if CurPageID = PropertyKeyPage.ID then
  begin
    Key := Trim(PropertyKeyPage.Values[0]);
    if Key = '' then
    begin
      MsgBox('Property key cannot be empty.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = PortPage.ID then
  begin
    Port := Trim(PortPage.Values[0]);
    PortNum := StrToIntDef(Port, 0);
    if (PortNum < 1024) or (PortNum > 65535) then
    begin
      MsgBox('Port must be between 1024 and 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if IsPortInUse(Port) then
    begin
      KillChoice := MsgBox(
        'Port ' + Port + ' is already in use by another process.'#13#10#13#10 +
        'Click YES to kill the existing process and use this port.'#13#10 +
        'Click NO to go back and choose a different port.',
        mbConfirmation, MB_YESNO);
      if KillChoice = IDYES then
      begin
        { Kill the process using this port }
        Exec('cmd.exe', '/c for /f "tokens=5" %a in (''netstat -ano ^| findstr :' + Port + ' ^| findstr LISTENING'') do taskkill /F /PID %a',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        { Brief wait for port release }
        Sleep(1000);
        if IsPortInUse(Port) then
        begin
          MsgBox('Could not free port ' + Port + '. Please choose a different port.', mbError, MB_OK);
          Result := False;
          Exit;
        end;
      end
      else
      begin
        Result := False;
        Exit;
      end;
    end;
    ChosenPort := Port;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NodePath: String;
  Key: String;
  EnvContent: String;
  TaskCmd: String;
begin
  if CurStep = ssPostInstall then
  begin
    { Write .env file with property key and chosen port }
    Key := Trim(PropertyKeyPage.Values[0]);
    if ChosenPort = '' then
      ChosenPort := '5000';

    EnvContent := 'PROPERTY_KEY=' + Key + #13#10 +
                  'CENTRAL_SERVER_URL=https://optima.sclera.com' + #13#10 +
                  'PORT=' + ChosenPort + #13#10;
    SaveStringToFile(ExpandConstant('{app}\backend\.env'), EnvContent, False);

    { Create scheduled tasks }
    NodePath := GetNodePath('');
    TaskCmd := '"' + NodePath + '" "' + ExpandConstant('{app}\backend\property-server.js') + '"';

    Exec('cmd.exe', '/c schtasks /Create /TN "OptimaProperty" /TR "' + TaskCmd + '" /SC ONSTART /RU SYSTEM /RL HIGHEST /F',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('cmd.exe', '/c schtasks /Create /TN "OptimaPropertyDaily" /TR "' + TaskCmd + '" /SC DAILY /ST 00:05 /RU SYSTEM /RL HIGHEST /F',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    { Start the property server immediately }
    Exec('cmd.exe', '/c start "" ' + TaskCmd,
      ExpandConstant('{app}\backend'), SW_HIDE, ewNoWait, ResultCode);
  end;
end;
