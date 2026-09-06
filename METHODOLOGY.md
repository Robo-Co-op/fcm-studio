# Modeling and simulation methodology

FCM Studio represents participant-assessed directional influence as a Fuzzy Cognitive Map. The software supports elicitation and scenario exploration; it does not infer verified causation from an agenda or validate a research instrument.

## Map semantics

Each factor has a stable ID, label, presentation coordinates, and provenance. Relationships connect a source factor to a target with a signed weight in [−1, +1]. Positive values indicate same-direction influence and negative values indicate opposite-direction influence. Zero means no stored relationship. Opposite directions may have different weights; self-relationships and feedback loops are supported.

The matrix uses **row = source, column = target**. These entries are influence assessments, not statistical correlations, probabilities, or measured effect sizes. Strength presets are conveniences for elicitation, not a validated measurement scale. Factor activation is normalized to [0, 1]; participants must define what a factor's low and high states mean.

AI proposals are hypotheses. Acceptance is an editing action and does not establish agreement among workshop participants. Record the basis for influential assumptions in descriptions and relationship rationales, and retain separate projects for research contexts that should not be combined.

## Deterministic update rule

Algorithm identifier: `modified-kosko-sigmoid-v1`.

For each non-fixed factor, all inputs are calculated from the previous step:

```text
input_j(t) = x_j(t) + sum_i(W_ij * x_i(t))
x_j(t + 1) = 1 / (1 + exp(-slope * input_j(t)))
```

The application uses slope 1, initial activation 0.5 unless specified, tolerance 0.0001, five consecutive stable transitions, and a maximum of 100 iterations. Stability means the maximum absolute factor change is strictly below the tolerance. The engine reports whether that condition was reached; reaching the iteration limit is not reported as convergence. Iterations are computational steps, not calendar time.

A fixed intervention overrides the factor's initial value and every subsequent update. Initial-only interventions affect the starting state and then evolve normally. Fixed factors continue influencing other factors through their outgoing relationships. The numerical engine accepts explicit settings programmatically; the prototype UI uses the documented defaults.

The self-state term is part of the equation even without a drawn self-edge. A drawn self-edge adds a further weighted contribution. **Disconnected factors can drift:** with no incoming relationships, a value of 0.5 becomes `sigmoid(0.5)`, approximately 0.62246, rather than staying at 0.5. This behavior is an assumption of this rule, not evidence of a real-world change. Clamp factors that should remain fixed, and assess whether this update rule fits the intended research before interpreting results.

## Baselines and reproducibility

An Excel import captures the original model as the baseline; the synthetic demonstration also has a baseline. A new empty project captures its model on the first simulation. Subsequent model edits and scenario loads do not replace it.

Each run records a model snapshot, factor order, initial values, fixed interventions, algorithm identifier, settings, and all activation states. Matching inputs and settings reproduce the same result. The comparison baseline runs at default initial activation without interventions; therefore comparison differences can include both structural edits and interventions. Factors newly added after baseline creation have no matched baseline value.

Changing the working model or intervention settings marks the displayed run as outdated. Export a run or full JSON project for a reproducible record. Matrix-only exports do not preserve scenarios, run history, or stable IDs. The UI retains the latest 10 runs; export important results before they age out.

## Reading results responsibly

Trajectories and final differences describe behavior within this particular model and equation. They are not forecasts, treatment effects, or proof that changing a factor will produce an outcome. Initial values, weight elicitation, factor definitions, update rule, and intervention choices all affect interpretation. Compare alternative assumptions and discuss disagreements with participants rather than treating numerical precision as research certainty.

Incoming and outgoing influence scores sum absolute weights; connection counts are separate. These descriptive graph measures do not establish a factor's practical importance or identify an optimal intervention.

Unit tests cover hand-calculated steps, directionality, fixed interventions, feedback, and stopping behavior. Browser tests check user workflows. Tests establish software behavior, not scientific validity. No live AI provider or participant-consensus process is validated by mocked AI tests.
