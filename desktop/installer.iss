#define MyAppName "مكتبة أبو بسام"
#define MyAppVersion "4.3.2"
#define MyAppPublisher "أكرم حاتم الغزالي"
#define MyAppExeName "AbuBassamLibrary.exe"

[Setup]
AppId={{8D0D6E52-6E08-4BC7-95A0-ABUBASSAM432}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Abu Bassam Library
DefaultGroupName={#MyAppName}
DisableDirPage=no
DisableProgramGroupPage=yes
OutputDir=dist\installer
OutputBaseFilename=Abu_Bassam_Library_Windows_Setup_4.3.2
SetupIconFile=build\icon.ico
WizardImageFile=build\wizard.bmp
WizardSmallImageFile=build\wizard-small.bmp
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
CloseApplications=yes
RestartApplications=no
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "إنشاء أيقونة مكتبة أبو بسام على سطح المكتب"; GroupDescription: "اختصارات إضافية:"; Flags: unchecked

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "تشغيل مكتبة أبو بسام"; Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard();
begin
  WizardForm.NextButton.Caption := 'التالي >';
  WizardForm.BackButton.Caption := '< السابق';
  WizardForm.CancelButton.Caption := 'إلغاء';
end;
