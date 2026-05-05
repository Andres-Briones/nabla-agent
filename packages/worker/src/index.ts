// Phase 1: re-exports stub-main as the package's public surface. Phase 3
// replaces with the real loop module.
export { main } from "./stub-main";
