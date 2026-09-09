const ethers = require('ethers');

// ---------------------------------------------------------------------------
// Canonical OnchainID / T-REX claim digest.
//
//   digest = keccak256( abi.encode(address identity, uint256 topic, bytes data) )
//
// The issuer signs this digest with an EIP-191 personal_sign (eth_sign of the message),
// so the signer is recovered with ethers.verifyMessage(getBytes(digest), signature).
//
// IMPORTANT: this MUST match the frontend's buildClaimDigest byte-for-byte, or every signature
// will fail verification. This is the standard OnchainID scheme and matches the sample payload
// (data is bytes, topic is uint256, identity is an address). If the frontend uses a different
// encoding (e.g. solidityPacked/encodePacked, or a different field order), change ONLY this
// function — everything else keys off it.
// ---------------------------------------------------------------------------
function buildClaimDigest(investorIdentityAddress, claimTopic, data) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'bytes'],
    [investorIdentityAddress, claimTopic, data],
  );
  return ethers.keccak256(encoded);
}

class ClaimSignatureService {
  buildClaimDigest(investorIdentityAddress, claimTopic, data) {
    return buildClaimDigest(investorIdentityAddress, claimTopic, data);
  }

  // Recovers the signing wallet from the signature and compares it to the expected (registered)
  // issuer wallet. The recovered wallet is derived ONLY from the signature — never trusted from
  // the caller. Returns { valid, signedByWallet }. Throws only on malformed crypto input, which
  // the caller classifies as VERIFICATION_FAILED.
  verifyClaimSignature({ investorIdentityAddress, expectedIssuerWallet, claimTopic, data, signature }) {
    const digest = buildClaimDigest(investorIdentityAddress, claimTopic, data);
    const signedByWallet = ethers.verifyMessage(ethers.getBytes(digest), signature);
    const valid = signedByWallet.toLowerCase() === String(expectedIssuerWallet).toLowerCase();
    return { valid, signedByWallet };
  }
}

module.exports = { ClaimSignatureService, buildClaimDigest };
