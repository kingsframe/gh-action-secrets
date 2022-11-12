import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { GhActionScrects } from "../target/types/gh_action_scrects";

describe("gh-action-scrects", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.GhActionScrects as Program<GhActionScrects>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
