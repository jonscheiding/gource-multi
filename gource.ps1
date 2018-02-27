[Int]$PeriodLengthInDays = Read-Host -Prompt "How many days do you want to show?"

$StartDate = (Get-Date).AddDays(-$PeriodLengthInDays)
$StartDateText = $StartDate.ToString("yyyy-MM-dd HH:mm")
$HasAnyChanges = $false

Remove-Item *.log

Get-ChildItem | Where-Object { $_.PSIsContainer } | %{
    $DirectoryName = $_.BaseName
    $LogFileName = "$DirectoryName.log"

    Write-Host -NoNewLine "Processing changes for $DirectoryName ... "

    git -C $DirectoryName pull | Out-Null
    $GitLogs = (git -C $DirectoryName log --since=$StartDateText) | Out-String
    
    if ( [string]::IsNullOrEmpty($GitLogs) ) {
        Write-Host "done (no changes)."
        return
    }
    
    $HasAnyChanges = $true

    Write-Host "done."

    gource `
        --start-date ($StartDate.ToString("yyyy-MM-dd HH:mm")) `
        --output-custom-log "$LogFileName" `
        $DirectoryName
    
    If (Test-Path -Path $LogFileName) {
        (Get-Content "$LogFileName" | ForEach-Object {
            $Columns = $_.Split("|")
            $Columns[3] = "/" + $DirectoryName + $Columns[3]
            return $Columns -join "|"
        }) | Out-File $LogFileName -Encoding UTF8
    }
}

if ( ! $HasAnyChanges ) {
    Write-Host "There were no changes during this period. Boo! Press any key to exit and go get to work."
    [void][System.Console]::ReadKey($true)
    exit
}

Get-Content *.log | Sort-Object { [Int]$_.Split("|")[0] } | Out-File combined.log -Encoding UTF8

Write-Host "Gource is ready! Press any key to continue."
[void][System.Console]::ReadKey($true)

gource combined.log --seconds-per-day 5