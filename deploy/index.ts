
import { expect } from "chai";
import fs from "fs";
import * as anchor from "@project-serum/anchor";
import {Program, web3} from "@project-serum/anchor";
// import { SquadsMpl } from "../idl/squads_mpl";
// import { ProgramManager } from "../idl/program_manager";
// import { Roles } from "../idl/roles";
// import { Mesh } from "../idl/mesh";

// import {
//     createBlankTransaction,
//     createTestTransferTransaction,
//     executeTransaction,
// } from "../helpers/transactions";
import { execSync } from "child_process";
import { LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, SystemProgram } from "@solana/web3.js";
import Squads, {
    getMsPDA,
    getIxPDA,
    getProgramManagerPDA,
    getAuthorityPDA,
    getTxPDA,
} from "@sqds/sdk";
import BN from "bn.js";
import { ASSOCIATED_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import {SquadsMpl} from "@sqds/sdk/lib/target/types/squads_mpl";
import {ProgramManager} from "@sqds/sdk/lib/target/types/program_manager";
// import { getExecuteProxyInstruction, getUserRolePDA, getUserDelegatePDA, getRolesManager } from "../helpers/roles";
//
// import {memberListApprove} from "../helpers/approve";

const BPF_UPGRADE_ID = new anchor.web3.PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
);

// const deploySmpl = () => {
//     const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/squads_mpl-keypair.json $(pwd)/target/deploy/squads_mpl.so`;
//     execSync(deployCmd);
// };
//
// const deployPm = () => {
//     const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/program_manager-keypair.json $(pwd)/target/deploy/program_manager.so`;
//     execSync(deployCmd);
// };
//
// const deployMesh = () => {
//     const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/mesh-keypair.json $(pwd)/target/deploy/mesh.so`;
//     execSync(deployCmd);
// };
//
// const deployRoles = () => {
//     const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/roles-keypair.json $(pwd)/target/deploy/roles.so`;
//     execSync(deployCmd);
// };

// will deploy a buffer for the program manager program
const writeBuffer = (bufferKeypair: string) => {
    const writeCmd = `solana program write-buffer --buffer ${bufferKeypair} --url localhost -v $(pwd)/target/deploy/program_manager.so`;
    execSync(writeCmd);
};

const setBufferAuthority = (
    bufferAddress: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey
) => {
    const authCmd = `solana program set-buffer-authority --url localhost ${bufferAddress.toBase58()} --new-buffer-authority ${authority.toBase58()}`;
    execSync(authCmd);
};

const setProgramAuthority = (
    programAddress: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey
) => {
    try {
        const logsCmd = `solana program show --url localhost --programs`;
        execSync(logsCmd, { stdio: "inherit" });
        const authCmd = `solana program set-upgrade-authority --url localhost ${programAddress.toBase58()} --new-upgrade-authority ${authority.toBase58()}`;
        execSync(authCmd, { stdio: "inherit" });
    } catch (e) {
        console.log(e);
        throw new Error(e as any);
    }
};

const getIxAuthority = async (txPda: anchor.web3.PublicKey, index: anchor.BN, programId: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddress([
            anchor.utils.bytes.utf8.encode("squad"),
            txPda.toBuffer(),
            index.toArrayLike(Buffer, "le", 4),
            anchor.utils.bytes.utf8.encode("ix_authority")],
        programId
    );
};

let provider = anchor.AnchorProvider.env();
    let randomCreateKey;
    let msPDA;
    let pmPDA;
    let member2;
    let rolesProgram;
const mplAddr = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu";
const programManagerAddr = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu";

async function main() {

        // console.log("Deploying programs...");
        // deploySmpl();
        // console.log("✔ SMPL Program deployed.");
        // deployPm();
        // console.log("✔ Program Manager Program deployed.");
        // deployRoles();
        // console.log("✔ Roles Program deployed.");
        // console.log("Finished deploying programs.");

       // let program = anchor.workspace.SquadsMpl as Program<SquadsMpl>;
        let squads = Squads.devnet(provider.wallet, {
            commitmentOrConfig: provider.connection.commitment,
            multisigProgramId: new PublicKey(mplAddr),
            programManagerProgramId: new PublicKey(programManagerAddr),
        });
        // the program-manager program / provider
    // let     programManagerProgram = anchor.workspace
    //         .ProgramManager as Program<ProgramManager>;

        // let creator = (program.provider as anchor.AnchorProvider).wallet;

        // the Multisig PDA to use for the test run
        randomCreateKey = anchor.web3.Keypair.generate().publicKey;
        [msPDA] = getMsPDA(randomCreateKey, squads.multisigProgramId);
        [pmPDA] = getProgramManagerPDA(msPDA, squads.programManagerProgramId);

        member2 = anchor.web3.Keypair.generate();

    console.log('0')
    const nextProgramIndex = await squads.getNextProgramIndex(
        getProgramManagerPDA(msPDA, squads.programManagerProgramId)[0]
    );

    console.log('1')
    const [vaultPDA] = await getAuthorityPDA(
        msPDA,
        new anchor.BN(1, 10),
        squads.multisigProgramId
    );
    console.log('2')

    // create a temp keypair to use
    const bufferKeypair = anchor.web3.Keypair.generate();

    // write the temp buffer keypair to file
    fs.writeFileSync(
        "tests/tmp/buffer_test_keypair.json",
        `[${bufferKeypair.secretKey.toString()}]`
    );

    // deploy/write the buffer
    writeBuffer("tests/tmp/buffer_test_keypair.json");
    // set the buffer authority to the vault
    setBufferAuthority(bufferKeypair.publicKey, vaultPDA);

    // check that the buffer has proper authority
    const parsedBufferAccount = await squads.connection.getParsedAccountInfo(
        bufferKeypair.publicKey
    );

    if(!parsedBufferAccount || !parsedBufferAccount.value){
        console.log("SHOULDNT BE NULL")
        return;
    }

    const parsedBufferData = (
        parsedBufferAccount.value.data as ParsedAccountData
    ).parsed;
    expect(parsedBufferData.type).to.equal("buffer");
    expect(parsedBufferData.info.authority).to.equal(vaultPDA.toBase58());

    // set the program authority
    setProgramAuthority(new PublicKey(programManagerAddr), vaultPDA);

    // add the program
    const nameString = "The program manager program, itself";
    const mpState = await squads.createManagedProgram(
        msPDA,
        new PublicKey(programManagerAddr),
        nameString
    );
    expect(mpState.name).to.equal(nameString);
    expect(mpState.managedProgramIndex).to.equal(nextProgramIndex);

    // create the upgrade

    const testUpgradeName = "Upgrade #1";
    const upgradeState = await squads.createProgramUpgrade(
        msPDA,
        mpState.publicKey,
        bufferKeypair.publicKey,
        squads.wallet.publicKey,
        vaultPDA,
        testUpgradeName
    );

    // verify the upgrade account was created, and that the buffers match as well in the ix
    const managedProgramState = await squads.getManagedProgram(
        mpState.publicKey
    );
    expect(upgradeState.upgradeIndex).to.equal(
        managedProgramState.upgradeIndex
    );
    expect(upgradeState.name).to.equal(testUpgradeName);
    // check the upgrade Ix accounts match
    expect(upgradeState.upgradeIx.programId.toBase58()).to.equal(
        BPF_UPGRADE_ID.toBase58()
    );
    // expect(upgradeState.upgradeIx.accounts[1].pubkey.toBase58()).to.equal(
    //     programManagerProgram.programId.toBase58()
    // );
    // expect(upgradeState.upgradeIx.accounts[2].pubkey.toBase58()).to.equal(
    //     bufferKeypair.publicKey.toBase58()
    // );
    // expect(upgradeState.upgradeIx.accounts[3].pubkey.toBase58()).to.equal(
    //     provider.wallet.publicKey.toBase58()
    // );
    // expect(upgradeState.upgradeIx.accounts[6].pubkey.toBase58()).to.equal(
    //     vaultPDA.toBase58()
    // );

    // create a new tx for the upgrade
    let txBuilder = await squads.getTransactionBuilder(msPDA, 1);
    // the upgrade instruction
    const upgradeIx = {
        programId: upgradeState.upgradeIx.programId,
        data: upgradeState.upgradeIx.upgradeInstructionData as Buffer,
        keys: upgradeState.upgradeIx.accounts as anchor.web3.AccountMeta[],
    };
    const [ixPDA] = getIxPDA(
        txBuilder.transactionPDA(),
        new BN(1, 10),
        squads.multisigProgramId
    );
    const [ix2PDA] = getIxPDA(
        txBuilder.transactionPDA(),
        new BN(2, 10),
        squads.multisigProgramId
    );
    txBuilder = await txBuilder
        .withInstruction(upgradeIx)
        .withSetAsExecuted(
            pmPDA,
            mpState.publicKey,
            upgradeState.publicKey,
            txBuilder.transactionPDA(),
            ixPDA,
            1
        );

    const [, txPDA] = await txBuilder.executeInstructions();

    // get the ix
    let ixState = await squads.getInstruction(ixPDA);
    expect(ixState.instructionIndex).to.equal(1);

    // get the ix 2
    let ix2State = await squads.getInstruction(ix2PDA);
    expect(ix2State.instructionIndex).to.equal(2);

    let txState = await squads.getTransaction(txPDA);
    expect(txState.instructionIndex).to.equal(2);

    // activate the tx
    await squads.activateTransaction(txPDA);

    txState = await squads.getTransaction(txPDA);
    expect(txState.status).to.have.property("active");

    const msState = await squads.getMultisig(msPDA);

    const numberOfMembersTotal = 10;
    const memberList = [...new Array(numberOfMembersTotal - 1)].map(() => {
        return anchor.web3.Keypair.generate();
    });
    // if the threshold has changed, use the other members to approve as well
    for (let i = 0; i < memberList.length; i++) {
        // check to see if we need more signers
        const approvalState = await squads.getTransaction(txPDA);
        if (Object.keys(approvalState.status).indexOf("active") < 0) {
            break;
        }

        const inMultisig = (msState.keys as anchor.web3.PublicKey[]).findIndex(
            (k) => {
                return k.toBase58() == memberList[i].publicKey.toBase58();
            }
        );
        if (inMultisig < 0) {
            continue;
        }
        try {
            await provider.connection.requestAirdrop(
                memberList[i].publicKey,
                anchor.web3.LAMPORTS_PER_SOL
            );
            // const approveTx = await program.methods
            //     .approveTransaction()
            //     .accounts({
            //         multisig: msPDA,
            //         transaction: txPDA,
            //         member: memberList[i].publicKey,
            //     })
            //     .signers([memberList[i]])
            //     .transaction();
            // try {
            //     await provider.sendAndConfirm(approveTx, [memberList[i]]);
            // } catch (e) {
            //     console.log(memberList[i].publicKey.toBase58(), " signing error");
            // }
        } catch (e) {
            console.log(e);
        }
    }

    txState = await squads.getTransaction(txPDA);
    expect(txState.status).to.have.property("executeReady");

    await squads.executeTransaction(txPDA);

    txState = await squads.getTransaction(txPDA);
    expect(txState.status).to.have.property("executed");
    const puState = await squads.getProgramUpgrade(upgradeState.publicKey);
    expect(puState.executed).to.be.true;
    expect(puState.upgradedOn.toNumber()).to.be.greaterThan(0);
}

main()