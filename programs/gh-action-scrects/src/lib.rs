use anchor_lang::prelude::*;

declare_id!("6zdDmuQg36ytdxeXYG6zoYdiiWVPXqao3Fvp2BbfV7o");

#[program]
pub mod gh_action_scrects {
    use super::*;
    // This is upgrade test 1
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
