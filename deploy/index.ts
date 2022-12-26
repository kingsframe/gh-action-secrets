import {expect} from "chai";
import fs from "fs";
import * as anchor from "@project-serum/anchor";
import {Program, web3} from "@project-serum/anchor";

import {execSync} from "child_process";
import {LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, SystemProgram} from "@solana/web3.js";
import Squads, {
    getMsPDA, getIxPDA, getProgramManagerPDA, getAuthorityPDA, getTxPDA,
} from "@sqds/sdk";
import BN from "bn.js";

const BPF_UPGRADE_ID = new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");


const deployRandomProgram = (keypair_path: string) => {
    const deployCmd = `solana program deploy -ud -v --program-id ${keypair_path} demo_program.so`
    execSync(deployCmd);
};

// will deploy a buffer for the program manager program
const writeBuffer = (bufferKeypair: string) => {
    const writeCmd1 = `pwd`;
    console.log(execSync(writeCmd1).toString());
    const writeCmd = `solana program write-buffer --buffer ${bufferKeypair} -ud -v ../target/deploy/gh_action_scrects.so`;
    execSync(writeCmd,{stdio: 'inherit'});
};

const setBufferAuthority = (bufferAddress: anchor.web3.PublicKey, authority: anchor.web3.PublicKey) => {
    const authCmd = `solana program set-buffer-authority -ud ${bufferAddress.toBase58()} --new-buffer-authority ${authority.toBase58()}`;
    execSync(authCmd, {stdio: 'inherit'});
};

const setProgramAuthority = (programAddress: anchor.web3.PublicKey, authority: anchor.web3.PublicKey) => {
    try {
        const authCmd = `solana program set-upgrade-authority -ud ${programAddress.toBase58()} --new-upgrade-authority ${authority.toBase58()}`;
        execSync(authCmd, {stdio: "inherit"});
    } catch (e) {
        console.log(e);
        throw new Error(e as any);
    }
};

const provider = anchor.AnchorProvider.env();
const DEFAULT_MULTISIG_PROGRAM_ID = new PublicKey(
    "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
);
const DEFAULT_PROGRAM_MANAGER_PROGRAM_ID = new PublicKey(
    "SMPLKTQhrgo22hFCVq2VGX1KAktTWjeizkhrdB1eauK"
);

async function upgradeContract(msPDA: PublicKey, upgradeName: string) {

    const squads = Squads.devnet(provider.wallet, {
        commitmentOrConfig: provider.connection.commitment,
    });

    const [pmPDA] = getProgramManagerPDA(msPDA, squads.programManagerProgramId);
    const programManagerPDA = getProgramManagerPDA(msPDA, squads.programManagerProgramId);
    const nextProgramIndex = await squads.getNextProgramIndex(programManagerPDA[0]);
    const [vaultPDA] = getAuthorityPDA(msPDA, new anchor.BN(1, 10), squads.multisigProgramId);

    // create a temp keypair to use
    const bufferKeypair = anchor.web3.Keypair.generate();

    // write the temp buffer keypair to file
    fs.writeFileSync("./buffer_test_keypair.json", `[${bufferKeypair.secretKey.toString()}]`);

    // deploy/write the buffer
    writeBuffer("./buffer_test_keypair.json");
    // set the buffer authority to the vault
    setBufferAuthority(bufferKeypair.publicKey, vaultPDA);

    // check that the buffer has proper authority
    const parsedBufferAccount = await squads.connection.getParsedAccountInfo(bufferKeypair.publicKey);

    if (!parsedBufferAccount || !parsedBufferAccount.value) {
        console.log("SHOULDNT BE NULL");
        return;
    }

    const parsedBufferData = (parsedBufferAccount.value.data as ParsedAccountData).parsed;
    expect(parsedBufferData.type).to.equal("buffer");
    expect(parsedBufferData.info.authority).to.equal(vaultPDA.toBase58());


    // make keypair for deploying test program
    // this should not be used in prod, substitute for real program instead
    const dummyProgramKeypair= anchor.web3.Keypair.generate();
    fs.writeFileSync("./program_test_keypair.json", `[${dummyProgramKeypair.secretKey.toString()}]`);

    // deploy/write the dummy program using existing keypair
    deployRandomProgram("./program_test_keypair.json");

    // set the program authority
    setProgramAuthority(dummyProgramKeypair.publicKey, vaultPDA);

    // add the program
    const nameString = "The program manager program, itself";
    const mpState = await squads.createManagedProgram(msPDA, dummyProgramKeypair.publicKey, nameString);
    expect(mpState.name).to.equal(nameString);
    expect(mpState.managedProgramIndex).to.equal(nextProgramIndex);

    // create the upgrade
    const upgradeState = await squads.createProgramUpgrade(msPDA, mpState.publicKey, bufferKeypair.publicKey, squads.wallet.publicKey, vaultPDA, upgradeName);

    // create a new tx for the upgrade
    let txBuilder = await squads.getTransactionBuilder(msPDA, 1);
    // the upgrade instruction
    const upgradeIx = {
        programId: upgradeState.upgradeIx.programId,
        data: upgradeState.upgradeIx.upgradeInstructionData as Buffer,
        keys: upgradeState.upgradeIx.accounts as anchor.web3.AccountMeta[],
    };
    const [ixPDA] = getIxPDA(txBuilder.transactionPDA(), new BN(1, 10), squads.multisigProgramId);
    const [ix2PDA] = getIxPDA(txBuilder.transactionPDA(), new BN(2, 10), squads.multisigProgramId);
    txBuilder = await txBuilder
        .withInstruction(upgradeIx)
        .withSetAsExecuted(pmPDA, mpState.publicKey, upgradeState.publicKey, txBuilder.transactionPDA(), ixPDA, 1);

    const [, txPDA] = await txBuilder.executeInstructions();

    // get the ix
    let ixState = await squads.getInstruction(ixPDA);
    expect(ixState.instructionIndex).to.equal(1);

    let txState = await squads.getTransaction(txPDA);
    expect(txState.instructionIndex).to.equal(2);

    // activate the tx
    await squads.activateTransaction(txPDA);

    txState = await squads.getTransaction(txPDA);
    expect(txState.status).to.have.property("active");

    console.log("✔ Created Upgrade Transaction");
}

//    https://devnet.squads.so/vault/assets/EdTg1h1qFKUwroqtrojn7gwmGUckpyvFgQ4WqEPPuc2n
const msPDA = new PublicKey("EdTg1h1qFKUwroqtrojn7gwmGUckpyvFgQ4WqEPPuc2n");
const testUpgradeName = "Upgrade #1 -dec24";
upgradeContract(msPDA, testUpgradeName);