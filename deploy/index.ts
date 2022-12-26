import {expect} from "chai";
import fs from "fs";
import * as anchor from "@project-serum/anchor";

import {execSync} from "child_process";
import {PublicKey} from "@solana/web3.js";
import Squads, {getAuthorityPDA, getIxPDA, getProgramManagerPDA,} from "@sqds/sdk";
import BN from "bn.js";

// will deploy a buffer for the program manager program
function setBufferAuthority(bufferAddress: anchor.web3.PublicKey, authority: anchor.web3.PublicKey) {
    const authCmd = `solana program set-buffer-authority -ud ${bufferAddress.toBase58()} --new-buffer-authority ${authority.toBase58()}`;
    execSync(authCmd, {stdio: 'inherit'});
}

function setProgramAuthority(programAddress: anchor.web3.PublicKey, authority: anchor.web3.PublicKey) {
    try {
        const authCmd = `solana program set-upgrade-authority -ud ${programAddress.toBase58()} --new-upgrade-authority ${authority.toBase58()}`;
        execSync(authCmd, {stdio: "inherit"});
    } catch (e) {
        console.log(e);
        throw new Error(e as any);
    }
}

const provider = anchor.AnchorProvider.env();
const DEFAULT_MULTISIG_PROGRAM_ID = new PublicKey(
    "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
);
const DEFAULT_PROGRAM_MANAGER_PROGRAM_ID = new PublicKey(
    "SMPLKTQhrgo22hFCVq2VGX1KAktTWjeizkhrdB1eauK"
);

async function upgradeContract(programIdToUpgrade: PublicKey,
                               solanaBinaryPath: string,
                               msPDA: PublicKey, //not the vault, but the account in the url bar
                               upgradeDisplayName: string, //name to show on the web ui
) {
    const squads = Squads.devnet(provider.wallet, {
        commitmentOrConfig: provider.connection.commitment,
    });

    const [pmPDA] = getProgramManagerPDA(msPDA, squads.programManagerProgramId);
    const [vaultPDA] = getAuthorityPDA(msPDA, new anchor.BN(1, 10), squads.multisigProgramId);

    // create a temp keypair to use
    const bufferKeypair = anchor.web3.Keypair.generate();

    // write the temp buffer keypair to file
    const tmpKeypairPath = "./buffer_test_keypair.json";
    fs.writeFileSync(tmpKeypairPath, `[${bufferKeypair.secretKey.toString()}]`);

    // deploy/write the buffer, needs keypair for new buffer, else will error
    const writeCmd = `solana program write-buffer --buffer ${tmpKeypairPath} -ud -v ${solanaBinaryPath}`;
    execSync(writeCmd, {stdio: 'inherit'});

    // set the buffer authority to the vault
    setBufferAuthority(bufferKeypair.publicKey, vaultPDA);

    // add the program
    const nameString = "The program manager program, itself";
    const mpState = await squads.createManagedProgram(msPDA, programIdToUpgrade, nameString);

    // create the upgrade
    const upgradeState = await squads.createProgramUpgrade(msPDA, mpState.publicKey, bufferKeypair.publicKey, squads.wallet.publicKey, vaultPDA, upgradeDisplayName);

    // create a new tx for the upgrade
    let txBuilder = await squads.getTransactionBuilder(msPDA, 1);
    const [ixPDA] = getIxPDA(txBuilder.transactionPDA(), new BN(1, 10), squads.multisigProgramId);
    txBuilder = await txBuilder
        .withInstruction(
            // the upgrade instruction
            {
                programId: upgradeState.upgradeIx.programId,
                data: upgradeState.upgradeIx.upgradeInstructionData as Buffer,
                keys: upgradeState.upgradeIx.accounts as anchor.web3.AccountMeta[],
            })
        .withSetAsExecuted(pmPDA, mpState.publicKey, upgradeState.publicKey, txBuilder.transactionPDA(), ixPDA, 1);

    const [, txPDA] = await txBuilder.executeInstructions();

    // get the ix
    const ixState = await squads.getInstruction(ixPDA);
    expect(ixState.instructionIndex).to.equal(1);

    let txState = await squads.getTransaction(txPDA);
    expect(txState.instructionIndex).to.equal(2);

    // activate the tx
    await squads.activateTransaction(txPDA);

    txState = await squads.getTransaction(txPDA);
    expect(txState.status).to.have.property("active");

    console.log("✔ Created Upgrade Transaction");
}

function deployDummyProgram(msPDA: PublicKey): PublicKey {
    // make keypair for deploying test program
    // this should not be used in prod, substitute for real program instead
    const dummyProgramKeypair = anchor.web3.Keypair.generate();

    // write the temp buffer keypair to file
    const temp_path = "./demo_program_keypair.json";
    fs.writeFileSync(temp_path, `[${dummyProgramKeypair.secretKey.toString()}]`);
    // deploy/write the dummy program using keypair (required for initial deploy)
    const deployCmd = `solana program deploy -ud --program-id ${temp_path} -v demo_program.so`;
    execSync(deployCmd);

    // set the program authority
    const [vaultPDA] = getAuthorityPDA(msPDA, new anchor.BN(1, 10), Squads.devnet(provider.wallet, {
        commitmentOrConfig: provider.connection.commitment,
    }).multisigProgramId);
    setProgramAuthority(dummyProgramKeypair.publicKey, vaultPDA);
    console.log('Deployed demo, program id = ', dummyProgramKeypair.publicKey.toBase58());
    return dummyProgramKeypair.publicKey;
}

//    https://devnet.squads.so/vault/assets/EdTg1h1qFKUwroqtrojn7gwmGUckpyvFgQ4WqEPPuc2n
const msPDA = new PublicKey("EdTg1h1qFKUwroqtrojn7gwmGUckpyvFgQ4WqEPPuc2n");
const testUpgradeName = "Upgrade #1 -dec25";
const dummyProgramId = deployDummyProgram(msPDA);

const newBinaryPath = `../target/deploy/gh_action_scrects.so`;

upgradeContract(dummyProgramId, newBinaryPath, msPDA, testUpgradeName);