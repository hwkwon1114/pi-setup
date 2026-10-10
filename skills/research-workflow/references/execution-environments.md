# Execution environments: shared rules, project-specific commands

Do not infer project relationships from machine names. Independent projects may use different environments on the same host. No shared account, directory, lockfile, tracker, or cross-machine sync is assumed.

## Inspect before launch

Establish the current host, project, supported interpreter/environment, scheduler or direct-launch convention, resource allocation, output roots, execution authorization, and budget. Use existing working setup instructions. No mandatory uv or environment migration. Older Linux compatibility must be checked, not inferred from local success. Install packages into a shared environment only after explicit approval.

Keep scientific settings separate from operational settings. Different hardware, precision, solver versions, seeds, parallel reduction order, or thread settings can change results; record material differences and validate numerical agreement before pooling runs. Identical source is not a guarantee of bitwise reproducibility.

## Budget and finalization

- Honor actual researcher/cluster allocations and estimate material total cost. Do not invent per-fit/aggregate CPU or wall deadlines, retry quotas or a budget-management framework when no concrete constraint requires them. Retain memory/device protection, scientific stopping and risk-appropriate process monitoring.
- When real CPU/wall deadlines apply, account for prior consumption and leave time for validation, checkpoint I/O and reporting. Unused CPU does not extend an expired wall allocation. Record concrete limits in the existing plan; planning estimates are not researcher-imposed ceilings.
- When the runner manages an actual allocation, verify that exhaustion stops new work and preserves partial artifacts without replaying completed cells or resetting the allocation. Test changed or unverified exhaustion/failure paths, reusing unchanged evidence. Do not add custom reserve arithmetic or runner tests solely to satisfy this guide.
- Ordinary repairs and authorized continuation proceed autonomously. Consult on substantial unplanned resource demand or unplanned restarts from scratch. Reporting cannot authorize new scientific scope or sealed-test access.

## Slurm / CPU cluster

- Use the project's submission script and supported environment/module/Conda setup.
- Do not run computational experiments on a login node. Follow local policy for light inspection and rendering; submit resource-intensive tasks.
- Create scheduler log directories before submission: Slurm may open output/error files before the job body can create them.
- Read CPU allocation from the scheduler and configure numerical libraries deliberately. Do not assume the number of Python processes equals the number of allocated cores; prevent oversubscription.
- Record job ID, selected configuration/cases, requested resources, actual host, environment, logs, artifacts, and exit status.
- Submission is not completion. Distinguish queued, running, completed, failed, cancelled, timed out, and unknown status using available scheduler and application evidence.
- Scheduler success does not prove every case completed or passed numerical checks. Preserve partial outputs, planned-versus-observed coverage, and case-level outcomes.
- Use explicit quoting/arrays or configuration files; do not promise arbitrary shell-quoted arguments survive a space-split environment variable. Avoid eval-based launch construction.
- Resumption must check source/config/data identity. Do not automatically cancel, resubmit, increase allocations, or force overwrites.

Account, partition, environment name, wall time, memory, and project paths belong in project instructions or private configuration, not this skill.

## Direct GPU host

- No scheduler is assumed. Inspect the project's allocation convention and current device use, but do not equate apparently idle GPUs with permission to use them.
- Explicitly select approved GPU IDs and concurrency, commonly via project launch settings such as CUDA_VISIBLE_DEVICES. Never assume all devices belong to this run.
- Preserve device mapping and framework versions; check CUDA/runtime compatibility and precision requirements rather than upgrading shared drivers/libraries.
- Ask before starting long-running background processes unless already authorized. Use the project's session/process supervision convention, capture logs and process identity, and arrange a reliable exit-status record.
- A PID existing is not success; a PID disappearing is not proof of completion. Do not kill other users' processes, seize devices, or silently relaunch failed runs.

## Local CPU/Mac and presentation

Use the existing local environment and explicitly scoped resource budget. Do not assume NVIDIA CUDA on macOS or that a GPU-backed API is supported. Avoid expensive experiments merely because no scheduler blocks them.

Rendering can occur wherever a compatible Quarto installation is permitted. Compute hosts need not install Quarto. Moving selected artifacts to another renderer is an explicit transfer decision, not an automatic sync policy. Local HTML can be read separately from computation; Linux rendering, offline assets, and site viewing must be tested on the target setup.

## Honest support labels

Keep tested local behavior, static guidance, and untested cluster execution distinct. Operational examples must be adapted and tested in a bounded authorized job before claiming host support. Never embed a user's account, credentials, absolute project paths, or assumed GPU allocation in a reusable skill.
