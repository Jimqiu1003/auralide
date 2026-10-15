#Requires -Version 7.0
<#
.SYNOPSIS
    Git worktree management for Auralide parallel (multi-agent) development.

.DESCRIPTION
    Creates, inspects and safely removes linked Git worktrees under the Auralide worktree root
    (default: D:\01_Projects\01_MyProjects\Auralide Worktrees).

    Safety rules enforced by this script:
      * worktrees are created outside the main repository, never nested inside it;
      * removal is refused when the worktree has uncommitted changes (there is no --force switch);
      * removal is refused when the branch is not merged into the base branch unless -AllowUnmerged;
      * removal is refused for paths outside the configured worktree root and for the main worktree.

.PARAMETER Command
    status  Show main repository + worktree summary.
    list    List every worktree with branch, cleanliness and sync state.
    new     Create a worktree with a new branch (requires -Name).
    check   Report whether a worktree is clean and merged (requires -Name).
    remove  Safely remove a worktree (requires -Name).
    sync    Fetch from origin, report ahead/behind, prune stale worktree records.

.PARAMETER Name
    Branch name (feat/xyz, fix/xyz, chore/xyz, docs/xyz, test/xyz, refactor/xyz) or an existing
    worktree directory name / path.

.PARAMETER Base
    Base branch for new worktrees and the merge check. Default: main.

.PARAMETER WorktreeRoot
    Parent directory for linked worktrees. Default: $env:AURALIDE_WORKTREE_ROOT or the Auralide default.

.PARAMETER AllowUnmerged
    Permit removing a worktree whose branch still has commits not merged into the base branch.

.PARAMETER DryRun
    Print the actions that would be taken without changing anything.

.EXAMPLE
    pwsh -NoProfile -File scripts/dev/worktree.ps1 status
.EXAMPLE
    pwsh -NoProfile -File scripts/dev/worktree.ps1 new feat/core-schema
.EXAMPLE
    pwsh -NoProfile -File scripts/dev/worktree.ps1 check feat-core-schema
.EXAMPLE
    pwsh -NoProfile -File scripts/dev/worktree.ps1 remove feat-core-schema
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('status', 'list', 'new', 'check', 'remove', 'sync')]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$Name,

    [string]$Base = 'main',

    [string]$WorktreeRoot = $(if ($env:AURALIDE_WORKTREE_ROOT) { $env:AURALIDE_WORKTREE_ROOT } else { 'D:\01_Projects\01_MyProjects\Auralide Worktrees' }),

    [switch]$AllowUnmerged,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$branchPrefixes = @('feat/', 'fix/', 'chore/', 'docs/', 'test/', 'refactor/')

function Invoke-Git {
    param(
        [Parameter(Mandatory)][string]$Repository,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    $output = & git -C $Repository @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed in '$Repository':`n$($output -join "`n")"
    }
    # The leading comma stops PowerShell from unrolling a single-element array, so callers can
    # rely on the result always being an array of lines.
    return , @($output)
}

function Get-WorktreeEntries {
    param([Parameter(Mandatory)][string]$Repository)

    $entries = @()
    $current = @{}
    foreach ($line in (Invoke-Git -Repository $Repository -Arguments @('worktree', 'list', '--porcelain'))) {
        if ($line -match '^worktree (.+)$') {
            if ($current.Count -gt 0) { $entries += [pscustomobject]$current }
            $current = @{ Path = $Matches[1]; Branch = $null; Head = $null }
        }
        elseif ($line -match '^HEAD (.+)$') { $current['Head'] = $Matches[1] }
        elseif ($line -match '^branch (.+)$') { $current['Branch'] = $Matches[1] -replace '^refs/heads/', '' }
        elseif ($line -match '^detached$') { $current['Branch'] = '(detached)' }
    }
    if ($current.Count -gt 0) { $entries += [pscustomobject]$current }

    return $entries
}

function Get-WorktreeState {
    param([Parameter(Mandatory)][string]$Path)

    $changes = @(& git -C $Path status --porcelain 2>&1)
    $upstream = (& git -C $Path rev-parse --abbrev-ref '@{upstream}' 2>$null)
    $ahead = $null
    $behind = $null
    if ($LASTEXITCODE -eq 0 -and $upstream) {
        $counts = (& git -C $Path rev-list --left-right --count "$upstream...HEAD" 2>$null) -split '\s+'
        if ($counts.Count -ge 2) {
            $behind = [int]$counts[0]
            $ahead = [int]$counts[1]
        }
    }

    return [pscustomobject]@{
        Path       = $Path
        Changes    = @($changes | Where-Object { $_ -ne '' })
        IsClean    = (@($changes | Where-Object { $_ -ne '' }).Count -eq 0)
        Upstream   = $upstream
        Ahead      = $ahead
        Behind     = $behind
    }
}

function Get-CommitDistance {
    param(
        [Parameter(Mandatory)][string]$Repository,
        [Parameter(Mandatory)][string]$Range
    )

    $raw = (Invoke-Git -Repository $Repository -Arguments @('rev-list', '--count', $Range))[0]
    $value = 0
    if (-not [int]::TryParse($raw, [ref]$value)) {
        throw "Unexpected 'git rev-list --count $Range' output: '$raw'"
    }
    return $value
}

function Resolve-WorktreeTarget {
    param(
        [Parameter(Mandatory)][string]$Repository,
        [Parameter(Mandatory)][string]$Requested
    )

    $entries = Get-WorktreeEntries -Repository $Repository
    $normalized = $Requested.TrimEnd('\', '/')

    $match = $entries | Where-Object {
        $_.Path -eq $Requested -or
        $_.Path.TrimEnd('\', '/') -eq $normalized -or
        (Split-Path -Leaf $_.Path) -eq $Requested -or
        $_.Branch -eq $Requested
    } | Select-Object -First 1

    if (-not $match) {
        throw "No worktree matches '$Requested'. Run: worktree.ps1 list"
    }
    return $match
}

function Assert-RemovableTarget {
    param(
        [Parameter(Mandatory)]$Entry,
        [Parameter(Mandatory)][string]$MainWorktree
    )

    if ($Entry.Path.TrimEnd('\', '/') -eq $MainWorktree.TrimEnd('\', '/')) {
        throw "Refusing to remove the main worktree '$($Entry.Path)'. Use git on the main repository instead."
    }

    $resolvedRoot = [System.IO.Path]::GetFullPath($WorktreeRoot).TrimEnd('\', '/')
    $resolvedPath = [System.IO.Path]::GetFullPath($Entry.Path).TrimEnd('\', '/')
    if (-not $resolvedPath.StartsWith("$resolvedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove '$resolvedPath': it is outside the configured worktree root '$resolvedRoot'."
    }
}

# --- context -------------------------------------------------------------------------------------

# `git worktree list` always reports the main working tree first, and the script may itself be run
# from a linked worktree — so resolve the main worktree from that list, not from the current path.
$worktrees = Get-WorktreeEntries -Repository $PSScriptRoot
$mainWorktree = $worktrees[0].Path

# --- commands ------------------------------------------------------------------------------------

try {
    switch ($Command) {
    'status' {
        $state = Get-WorktreeState -Path $mainWorktree
        $branch = (Invoke-Git -Repository $mainWorktree -Arguments @('branch', '--show-current'))[0]
        $head = (Invoke-Git -Repository $mainWorktree -Arguments @('rev-parse', '--short', 'HEAD'))[0]

        Write-Output '=== Auralide worktree status ==='
        Write-Output "Main worktree : $mainWorktree"
        Write-Output "Branch        : $branch @ $head"
        Write-Output "Working tree  : $(if ($state.IsClean) { 'clean' } else { "dirty ($($state.Changes.Count) change(s))" })"
        Write-Output "Upstream      : $(if ($state.Upstream) { "$($state.Upstream) (ahead $($state.Ahead), behind $($state.Behind))" } else { 'none' })"
        Write-Output "Worktree root : $WorktreeRoot ($(if (Test-Path -LiteralPath $WorktreeRoot) { 'exists' } else { 'missing' }))"
        Write-Output "Worktrees     : $($worktrees.Count) (including main)"
        if (-not $state.IsClean) {
            Write-Output ''
            Write-Output 'Uncommitted changes in the main worktree:'
            $state.Changes | ForEach-Object { Write-Output "  $_" }
        }
    }

    'list' {
        $rows = foreach ($entry in $worktrees) {
            $state = Get-WorktreeState -Path $entry.Path
            [pscustomobject]@{
                Branch  = if ($entry.Branch) { $entry.Branch } else { '(detached)' }
                State   = if ($state.IsClean) { 'clean' } else { "dirty:$($state.Changes.Count)" }
                Sync    = if ($state.Upstream) { "ahead $($state.Ahead) / behind $($state.Behind)" } else { 'no upstream' }
                Path    = $entry.Path
            }
        }
        $rows | Format-Table -AutoSize
    }

    'new' {
        if (-not $Name) { throw "Command 'new' requires -Name <branch>, for example: new feat/core-schema" }
        $hasValidPrefix = $false
        foreach ($prefix in $branchPrefixes) {
            if ($Name.StartsWith($prefix)) { $hasValidPrefix = $true; break }
        }
        if (-not $hasValidPrefix) {
            throw "Branch '$Name' must start with one of: $($branchPrefixes -join ', ')"
        }
        if ($worktrees.Branch -contains $Name) {
            throw "Branch '$Name' is already checked out in another worktree."
        }

        $directoryName = $Name -replace '/', '-'
        $targetPath = Join-Path $WorktreeRoot $directoryName

        if (Test-Path -LiteralPath $targetPath) {
            throw "Target path already exists: $targetPath"
        }
        if (-not (Test-Path -LiteralPath $WorktreeRoot)) {
            Write-Output "Creating worktree root: $WorktreeRoot"
            if (-not $DryRun) { New-Item -ItemType Directory -Path $WorktreeRoot -Force | Out-Null }
        }

        Write-Output "Creating worktree '$Name' from '$Base' at:"
        Write-Output "  $targetPath"
        if ($DryRun) { Write-Output '(dry run: nothing changed)'; break }

        Invoke-Git -Repository $mainWorktree -Arguments @('worktree', 'add', '-b', $Name, $targetPath, $Base) | ForEach-Object { Write-Output "  $_" }
        Write-Output ''
        Write-Output 'Next steps:'
        Write-Output "  Set-Location -LiteralPath '$targetPath'"
        Write-Output '  pnpm install    # once per worktree (shares the pnpm store)'
    }

    'check' {
        if (-not $Name) { throw "Command 'check' requires -Name <branch|directory>." }
        $entry = Resolve-WorktreeTarget -Repository $mainWorktree -Requested $Name
        $state = Get-WorktreeState -Path $entry.Path
        $unmerged = Get-CommitDistance -Repository $mainWorktree -Range "$Base..$($entry.Branch)"

        Write-Output "Worktree : $($entry.Path)"
        Write-Output "Branch   : $($entry.Branch)"
        Write-Output "State    : $(if ($state.IsClean) { 'clean' } else { "dirty ($($state.Changes.Count) change(s))" })"
        if (-not $state.IsClean) { $state.Changes | ForEach-Object { Write-Output "  $_" } }
        Write-Output "Sync     : $(if ($state.Upstream) { "$($state.Upstream) (ahead $($state.Ahead), behind $($state.Behind))" } else { 'no upstream' })"
        Write-Output "Commits not in ${Base}: $unmerged"
        Write-Output "Removable: $(if ($state.IsClean -and $unmerged -eq 0) { 'yes' } elseif ($state.IsClean) { 'only with -AllowUnmerged' } else { 'no (uncommitted changes)' })"
    }

    'remove' {
        if (-not $Name) { throw "Command 'remove' requires -Name <branch|directory>." }
        $entry = Resolve-WorktreeTarget -Repository $mainWorktree -Requested $Name
        Assert-RemovableTarget -Entry $entry -MainWorktree $mainWorktree

        $state = Get-WorktreeState -Path $entry.Path
        if (-not $state.IsClean) {
            Write-Output "Refusing to remove '$($entry.Path)': it has uncommitted changes."
            $state.Changes | ForEach-Object { Write-Output "  $_" }
            Write-Output 'Commit, stash or discard them explicitly, or keep the worktree.'
            throw 'worktree removal aborted: dirty working tree'
        }

        $unmerged = Get-CommitDistance -Repository $mainWorktree -Range "$Base..$($entry.Branch)"
        if ($unmerged -gt 0 -and -not $AllowUnmerged) {
            throw "Branch '$($entry.Branch)' has $unmerged commit(s) not merged into '$Base'. Merge them, or re-run with -AllowUnmerged."
        }

        Write-Output "Removing worktree '$($entry.Path)' (branch $($entry.Branch))"
        if ($DryRun) { Write-Output '(dry run: nothing changed)'; break }

        Invoke-Git -Repository $mainWorktree -Arguments @('worktree', 'remove', $entry.Path) | ForEach-Object { Write-Output "  $_" }

        if ($unmerged -eq 0) {
            Invoke-Git -Repository $mainWorktree -Arguments @('branch', '-d', $entry.Branch) | ForEach-Object { Write-Output "  $_" }
        }
        else {
            Write-Output "Kept local branch '$($entry.Branch)' (-AllowUnmerged was used); delete it explicitly if it is obsolete."
        }
        Write-Output 'Worktree removed safely.'
    }

    'sync' {
        Write-Output '=== fetching origin ==='
        Invoke-Git -Repository $mainWorktree -Arguments @('fetch', '--prune', 'origin') | ForEach-Object { Write-Output "  $_" }

        $rows = foreach ($entry in $worktrees) {
            $state = Get-WorktreeState -Path $entry.Path
            [pscustomobject]@{
                Branch = if ($entry.Branch) { $entry.Branch } else { '(detached)' }
                State  = if ($state.IsClean) { 'clean' } else { "dirty:$($state.Changes.Count)" }
                Sync   = if ($state.Upstream) { "ahead $($state.Ahead) / behind $($state.Behind)" } else { 'no upstream' }
                Path   = $entry.Path
            }
        }
        $rows | Format-Table -AutoSize

        Write-Output '=== pruning stale worktree records ==='
        Invoke-Git -Repository $mainWorktree -Arguments @('worktree', 'prune', '--verbose') | ForEach-Object { Write-Output "  $_" }
        Write-Output 'Sync complete.'
        }
    }
}
catch {
    # A refusal (dirty worktree, unmerged branch, unsafe path, unknown name) is a normal outcome:
    # report it as one line and exit non-zero instead of dumping a PowerShell exception trace.
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
