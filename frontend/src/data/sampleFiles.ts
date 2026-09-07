/** Bundled example traces served from `public/`. */
export interface SampleFile {
  id: string
  name: string
  file: string
}

export const SAMPLE_FILES: SampleFile[] = [
  { id: "circuit_2q_bell_state", name: "2q Bell state", file: "circuit_2q_bell_state.json" },
  { id: "circuit_2q_cnot_simple", name: "2q CNOT", file: "circuit_2q_cnot_simple.json" },
  {
    id: "circuit_2q_h_both_cnot",
    name: "2q H on both + CNOT",
    file: "circuit_2q_h_both_cnot.json",
  },
  { id: "circuit_2q_x_cnot", name: "2q X + CNOT", file: "circuit_2q_x_cnot.json" },
  { id: "circuit_2q_z_cnot", name: "2q Z + CNOT", file: "circuit_2q_z_cnot.json" },
  { id: "circuit_3q_bell_chain", name: "3q Bell chain", file: "circuit_3q_bell_chain.json" },
  { id: "circuit_3q_fan_out", name: "3q fan-out", file: "circuit_3q_fan_out.json" },
  { id: "circuit_3q_linear", name: "3q linear", file: "circuit_3q_linear.json" },
  {
    id: "circuit_4q_full_entangle",
    name: "4q fully entangled",
    file: "circuit_4q_full_entangle.json",
  },
  { id: "circuit_4q_ghz", name: "4q GHZ", file: "circuit_4q_ghz.json" },
  { id: "circuit_4q_ring", name: "4q ring", file: "circuit_4q_ring.json" },
  { id: "circuit_5q_linear", name: "5q linear", file: "circuit_5q_linear.json" },
  { id: "circuit_6q_ladder", name: "6q ladder", file: "circuit_6q_ladder.json" },
  {
    id: "circuit_6q_ladder_oracle",
    name: "6q ladder (sampled outcomes)",
    file: "circuit_6q_ladder_oracle.json",
  },
  { id: "circuit_2q_t_bell", name: "2q T-Bell (T gate)", file: "circuit_2q_t_bell.json" },
  { id: "circuit_2q_qft", name: "2q QFT (T gates)", file: "circuit_2q_qft.json" },
]

export const DEFAULT_SAMPLE_FILE = SAMPLE_FILES[0]

export function findSampleFile(sampleId: string): SampleFile | undefined {
  return SAMPLE_FILES.find((sample) => sample.id === sampleId)
}
