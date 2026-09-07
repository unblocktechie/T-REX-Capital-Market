const STORAGE_KEY = 'trex_admin_review_state_v1';
const wait = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));
const now = new Date();
const isoDaysAgo = (days, hour = 10) => {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  value.setHours(hour, 12, 0, 0);
  return value.toISOString();
};

const reviewers = [
  { id: 'rev-001', name: 'Maya Chen', email: 'maya.chen@trex.example', role: 'Senior Compliance Lead', avatar: 'MC' },
  { id: 'rev-002', name: 'Noah Williams', email: 'noah.williams@trex.example', role: 'KYB Analyst', avatar: 'NW' },
  { id: 'rev-003', name: 'Aisha Patel', email: 'aisha.patel@trex.example', role: 'Risk & AML Reviewer', avatar: 'AP' },
  { id: 'rev-004', name: 'Liam Carter', email: 'liam.carter@trex.example', role: 'Compliance Manager', avatar: 'LC' },
];

const commonDocuments = (prefix, offset = 0) => [
  {
    id: `${prefix}-doc-1`,
    name: 'Certificate of Incorporation',
    fileName: 'certificate-of-incorporation.pdf',
    type: 'PDF',
    size: 1284000,
    uploadedAt: isoDaysAgo(4 + offset),
    status: 'verified',
    previewTone: 'blue',
  },
  {
    id: `${prefix}-doc-2`,
    name: 'Articles of Association',
    fileName: 'articles-of-association.pdf',
    type: 'PDF',
    size: 2248000,
    uploadedAt: isoDaysAgo(4 + offset),
    status: 'verified',
    previewTone: 'violet',
  },
  {
    id: `${prefix}-doc-3`,
    name: 'Proof of Registered Address',
    fileName: 'registered-address-proof.pdf',
    type: 'PDF',
    size: 784000,
    uploadedAt: isoDaysAgo(3 + offset),
    status: 'pending',
    previewTone: 'emerald',
  },
  {
    id: `${prefix}-doc-4`,
    name: 'Tax Certificate',
    fileName: 'tax-certificate.pdf',
    type: 'PDF',
    size: 626000,
    uploadedAt: isoDaysAgo(3 + offset),
    status: 'pending',
    previewTone: 'amber',
  },
  {
    id: `${prefix}-doc-5`,
    name: 'Shareholder Register',
    fileName: 'shareholder-register.xlsx',
    type: 'XLSX',
    size: 418000,
    uploadedAt: isoDaysAgo(2 + offset),
    status: 'verified',
    previewTone: 'cyan',
  },
];

const organizations = [
  {
    id: 'org-001',
    logo: 'NV',
    name: 'Nova Verde Infrastructure Ltd.',
    legalName: 'Nova Verde Infrastructure Limited',
    registrationNumber: 'GB-11849273',
    country: 'United Kingdom',
    countryCode: 'GB',
    flag: '🇬🇧',
    jurisdiction: 'England and Wales',
    entityType: 'Private Limited Company',
    taxId: 'GB 391 8204 17',
    address: '20 Fenchurch Street, London EC3M 3AZ, United Kingdom',
    website: 'novaverde.example',
    registrationDate: '2018-04-16',
    industry: 'Renewable Infrastructure',
    submittedAt: isoDaysAgo(1, 9),
    updatedAt: isoDaysAgo(0, 9),
    status: 'pending',
    riskScore: 22,
    riskLevel: 'low',
    reviewer: reviewers[0],
    wallet: {
      address: '0x8A4F07fA4F99A70e4fC91F7B4A2d5b0e82a78C11',
      network: 'Sepolia',
      provider: 'MetaMask',
      connectedAt: isoDaysAgo(1, 9),
      verified: true,
    },
    progress: 88,
    progressSteps: [
      ['Company Information', 'complete'],
      ['Registration', 'complete'],
      ['Directors', 'complete'],
      ['UBO', 'complete'],
      ['Wallet Connected', 'complete'],
      ['Documents Uploaded', 'complete'],
      ['AML Screening', 'complete'],
      ['KYB Review', 'current'],
      ['Final Approval', 'pending'],
    ],
    ubos: [
      { id: 'ubo-001', name: 'Elena Rossi', initials: 'ER', ownership: 55, nationality: 'Italian', kycStatus: 'verified', wallet: '0x0B52…C29A', risk: 'low' },
      { id: 'ubo-002', name: 'Daniel Mercer', initials: 'DM', ownership: 30, nationality: 'British', kycStatus: 'verified', wallet: '0x74C1…5B10', risk: 'low' },
      { id: 'ubo-003', name: 'Sophia Klein', initials: 'SK', ownership: 15, nationality: 'German', kycStatus: 'review', wallet: 'Not provided', risk: 'medium' },
    ],
    directors: [
      { id: 'dir-001', name: 'Elena Rossi', initials: 'ER', position: 'Chief Executive Officer', nationality: 'Italian', email: 'elena@novaverde.example', phone: '+44 20 7946 0182', kycStatus: 'verified', risk: 'low' },
      { id: 'dir-002', name: 'Daniel Mercer', initials: 'DM', position: 'Finance Director', nationality: 'British', email: 'daniel@novaverde.example', phone: '+44 20 7946 0194', kycStatus: 'verified', risk: 'low' },
    ],
    risk: {
      overall: 22,
      checks: [
        { label: 'AML screening', result: 'Clear', tone: 'success', detail: 'No adverse matches' },
        { label: 'Sanctions check', result: 'Clear', tone: 'success', detail: '0 sanctions matches' },
        { label: 'PEP check', result: 'Review', tone: 'warning', detail: '1 possible indirect association' },
        { label: 'Jurisdiction risk', result: 'Low', tone: 'success', detail: 'United Kingdom' },
        { label: 'Document authenticity', result: '96%', tone: 'info', detail: 'Machine validation confidence' },
        { label: 'Ownership structure', result: 'Clear', tone: 'success', detail: 'Fully disclosed' },
      ],
    },
    documents: commonDocuments('org-001'),
    notes: [
      { id: 'note-1', author: 'Maya Chen', initials: 'MC', message: 'Corporate registry information matches the submitted certificate. PEP association needs final analyst confirmation.', createdAt: isoDaysAgo(0, 8), internal: true },
    ],
    activity: [
      { id: 'act-1', title: 'Organization submitted', description: 'Application entered the compliance review queue.', at: isoDaysAgo(1, 9), tone: 'info' },
      { id: 'act-2', title: 'Wallet connected', description: 'Sepolia issuer wallet ownership confirmed.', at: isoDaysAgo(1, 9), tone: 'success' },
      { id: 'act-3', title: 'Reviewer assigned', description: 'Maya Chen assigned as primary reviewer.', at: isoDaysAgo(1, 10), tone: 'violet' },
      { id: 'act-4', title: 'AML screening completed', description: 'Automated screening completed with one item for review.', at: isoDaysAgo(0, 8), tone: 'warning' },
    ],
  },
  {
    id: 'org-002', logo: 'AP', name: 'Aster Peak Capital SPC', legalName: 'Aster Peak Capital SPC', registrationNumber: 'KY-394102', country: 'Cayman Islands', countryCode: 'KY', flag: '🇰🇾', jurisdiction: 'Cayman Islands', entityType: 'Segregated Portfolio Company', taxId: 'KY-TAX-88219', address: '89 Nexus Way, Camana Bay, Grand Cayman', website: 'asterpeak.example', registrationDate: '2020-09-11', industry: 'Private Equity', submittedAt: isoDaysAgo(1, 13), updatedAt: isoDaysAgo(0, 10), status: 'under_review', riskScore: 48, riskLevel: 'medium', reviewer: reviewers[2], wallet: { address: '0x29f0C5A71c4498C7F39d25111b1B33E13A7B92CE', network: 'Sepolia', provider: 'WalletConnect', connectedAt: isoDaysAgo(1, 13), verified: true }, progress: 76,
    progressSteps: [['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','current'],['KYB Review','pending'],['Final Approval','pending']],
    ubos: [{ id:'ubo-021', name:'Marcus Lee', initials:'ML', ownership:60, nationality:'Singaporean', kycStatus:'verified', wallet:'0x8FE1…129A', risk:'medium'},{id:'ubo-022',name:'Aster Holdings Pte.',initials:'AH',ownership:40,nationality:'Singapore',kycStatus:'review',wallet:'0x5CD2…410B',risk:'medium'}],
    directors: [{id:'dir-021',name:'Marcus Lee',initials:'ML',position:'Managing Director',nationality:'Singaporean',email:'marcus@asterpeak.example',phone:'+65 6123 9012',kycStatus:'verified',risk:'medium'}],
    risk:{overall:48,checks:[{label:'AML screening',result:'Review',tone:'warning',detail:'2 fuzzy matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No confirmed match'},{label:'PEP check',result:'Clear',tone:'success',detail:'No PEP matches'},{label:'Jurisdiction risk',result:'Medium',tone:'warning',detail:'Enhanced due diligence'},{label:'Document authenticity',result:'91%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Complex',tone:'warning',detail:'SPC ownership layers'}]},
    documents: commonDocuments('org-002',1), notes:[], activity:[{id:'act-21',title:'Organization submitted',description:'Application entered the review queue.',at:isoDaysAgo(1,13),tone:'info'},{id:'act-22',title:'Reviewer assigned',description:'Aisha Patel assigned.',at:isoDaysAgo(1,15),tone:'violet'}],
  },
  {
    id: 'org-003', logo: 'BH', name: 'Blue Harbor Real Assets LLC', legalName: 'Blue Harbor Real Assets LLC', registrationNumber: 'DE-7749201', country: 'United States', countryCode: 'US', flag: '🇺🇸', jurisdiction: 'Delaware', entityType: 'Limited Liability Company', taxId: '88-6149027', address: '1209 Orange Street, Wilmington, Delaware 19801', website: 'blueharbor.example', registrationDate: '2021-01-22', industry: 'Real Estate', submittedAt: isoDaysAgo(2, 11), updatedAt: isoDaysAgo(1, 16), status: 'pending', riskScore: 17, riskLevel: 'low', reviewer: null, wallet: { address: '0x1D8B61A2e001627F013C9B40F1d2e89F029C17eA', network: 'Sepolia', provider: 'MetaMask', connectedAt: isoDaysAgo(2,11), verified: true }, progress: 91,
    progressSteps: [['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','current'],['Final Approval','pending']],
    ubos:[{id:'ubo-031',name:'Olivia Bennett',initials:'OB',ownership:70,nationality:'American',kycStatus:'verified',wallet:'0x8841…A2BC',risk:'low'},{id:'ubo-032',name:'Ethan Brooks',initials:'EB',ownership:30,nationality:'American',kycStatus:'verified',wallet:'0xA9C1…D830',risk:'low'}], directors:[{id:'dir-031',name:'Olivia Bennett',initials:'OB',position:'Managing Member',nationality:'American',email:'olivia@blueharbor.example',phone:'+1 302 555 0177',kycStatus:'verified',risk:'low'}],
    risk:{overall:17,checks:[{label:'AML screening',result:'Clear',tone:'success',detail:'No adverse matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'0 matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'0 matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'United States'},{label:'Document authenticity',result:'98%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Clear',tone:'success',detail:'Direct ownership'}]}, documents:commonDocuments('org-003',2),notes:[],activity:[{id:'act-31',title:'Organization submitted',description:'Application entered the review queue.',at:isoDaysAgo(2,11),tone:'info'}],
  },
  {
    id: 'org-004', logo: 'CF', name: 'Cedar Fintech Pte. Ltd.', legalName: 'Cedar Fintech Pte. Ltd.', registrationNumber: 'SG-202118340K', country: 'Singapore', countryCode: 'SG', flag: '🇸🇬', jurisdiction: 'Singapore', entityType: 'Private Company Limited by Shares', taxId: '202118340K', address: '1 Raffles Place, Singapore 048616', website: 'cedarfintech.example', registrationDate: '2021-05-18', industry: 'Financial Technology', submittedAt: isoDaysAgo(3, 14), updatedAt: isoDaysAgo(0, 11), status: 'approved', riskScore: 12, riskLevel: 'low', reviewer: reviewers[1], wallet: { address: '0x92326Ea06D8f86F1D98d56f7A547A479cE70aB82', network: 'Sepolia', provider: 'MetaMask', connectedAt: isoDaysAgo(3,14), verified: true }, progress:100,
    progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','complete'],['Final Approval','complete']], ubos:[{id:'ubo-041',name:'Wei Jun Tan',initials:'WT',ownership:100,nationality:'Singaporean',kycStatus:'verified',wallet:'0x70F4…DD28',risk:'low'}], directors:[{id:'dir-041',name:'Wei Jun Tan',initials:'WT',position:'Director',nationality:'Singaporean',email:'weijun@cedarfintech.example',phone:'+65 6777 9011',kycStatus:'verified',risk:'low'}], risk:{overall:12,checks:[{label:'AML screening',result:'Clear',tone:'success',detail:'No adverse matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'0 matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'0 matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'Singapore'},{label:'Document authenticity',result:'99%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Clear',tone:'success',detail:'Direct owner'}]}, documents:commonDocuments('org-004',3).map(d=>({...d,status:'verified'})),notes:[],activity:[{id:'act-41',title:'Organization approved',description:'Final compliance approval completed.',at:isoDaysAgo(0,11),tone:'success'}],
  },
  {
    id: 'org-005', logo: 'DG', name: 'Dune Growth Partners FZ-LLC', legalName: 'Dune Growth Partners FZ-LLC', registrationNumber: 'DIFC-CL-58721', country: 'United Arab Emirates', countryCode: 'AE', flag: '🇦🇪', jurisdiction: 'Dubai International Financial Centre', entityType: 'Free Zone LLC', taxId: '100492183700003', address: 'Gate Avenue, DIFC, Dubai, UAE', website: 'dunegrowth.example', registrationDate: '2019-11-04', industry: 'Venture Capital', submittedAt: isoDaysAgo(4, 10), updatedAt: isoDaysAgo(1, 12), status: 'rejected', riskScore: 74, riskLevel: 'high', reviewer: reviewers[3], wallet: { address: '0x733B76d84333251C6834e08B2B83fF8D7ab0C112', network: 'Sepolia', provider: 'WalletConnect', connectedAt: isoDaysAgo(4,10), verified: true }, progress: 82,
    progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','complete'],['Final Approval','rejected']], ubos:[{id:'ubo-051',name:'Omar Al Nuaimi',initials:'ON',ownership:51,nationality:'Emirati',kycStatus:'review',wallet:'0xC871…940A',risk:'high'},{id:'ubo-052',name:'Nexus Global Holdings',initials:'NG',ownership:49,nationality:'British Virgin Islands',kycStatus:'review',wallet:'Not provided',risk:'high'}], directors:[{id:'dir-051',name:'Omar Al Nuaimi',initials:'ON',position:'Managing Director',nationality:'Emirati',email:'omar@dunegrowth.example',phone:'+971 4 555 0198',kycStatus:'review',risk:'high'}], risk:{overall:74,checks:[{label:'AML screening',result:'Escalated',tone:'danger',detail:'Confirmed adverse media'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No sanctions match'},{label:'PEP check',result:'High',tone:'danger',detail:'Confirmed PEP relationship'},{label:'Jurisdiction risk',result:'Medium',tone:'warning',detail:'Cross-border ownership'},{label:'Document authenticity',result:'72%',tone:'danger',detail:'Manual review required'},{label:'Ownership structure',result:'Opaque',tone:'danger',detail:'Unverified holding entity'}]}, documents:commonDocuments('org-005',4).map((d,i)=>i===4?{...d,status:'rejected'}:d),notes:[{id:'note-51',author:'Liam Carter',initials:'LC',message:'Rejected pending independently certified shareholder register and clarification of the offshore holding entity.',createdAt:isoDaysAgo(1,12),internal:true}],activity:[{id:'act-51',title:'Organization rejected',description:'Application rejected due to unresolved ownership and document concerns.',at:isoDaysAgo(1,12),tone:'danger'}], rejectionReason:'Ownership information could not be independently verified.'
  },
  {
    id: 'org-006', logo: 'EL', name: 'Eon Life Sciences GmbH', legalName: 'Eon Life Sciences GmbH', registrationNumber: 'HRB 244891 B', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', jurisdiction: 'Berlin', entityType: 'Gesellschaft mit beschränkter Haftung', taxId: 'DE349201187', address: 'Friedrichstraße 88, 10117 Berlin, Germany', website: 'eonlife.example', registrationDate: '2022-02-08', industry: 'Biotechnology', submittedAt: isoDaysAgo(2, 16), updatedAt: isoDaysAgo(1, 9), status: 'pending', riskScore: 31, riskLevel: 'medium', reviewer: reviewers[1], wallet: { address: '0x94B99eC23B4228C7f02A9aD86f4f4BA7C47A9C21', network: 'Sepolia', provider: 'MetaMask', connectedAt: isoDaysAgo(2,16), verified: true }, progress:84,
    progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','current'],['Final Approval','pending']], ubos:[{id:'ubo-061',name:'Dr. Hannah Vogel',initials:'HV',ownership:62,nationality:'German',kycStatus:'verified',wallet:'0xF72A…8D19',risk:'low'},{id:'ubo-062',name:'BioVentures AG',initials:'BV',ownership:38,nationality:'Swiss',kycStatus:'review',wallet:'0x99A2…27B1',risk:'medium'}], directors:[{id:'dir-061',name:'Dr. Hannah Vogel',initials:'HV',position:'Managing Director',nationality:'German',email:'hannah@eonlife.example',phone:'+49 30 555 0162',kycStatus:'verified',risk:'low'}], risk:{overall:31,checks:[{label:'AML screening',result:'Clear',tone:'success',detail:'No adverse matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'0 matches'},{label:'PEP check',result:'Review',tone:'warning',detail:'Institutional shareholder review'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'Germany'},{label:'Document authenticity',result:'94%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Review',tone:'warning',detail:'Corporate shareholder'}]},documents:commonDocuments('org-006',2),notes:[],activity:[{id:'act-61',title:'Documents verified',description:'Four of five documents verified.',at:isoDaysAgo(1,9),tone:'success'}],
  },
  {
    id: 'org-007', logo: 'FK', name: 'Frontier Kinetic SAS', legalName: 'Frontier Kinetic SAS', registrationNumber: 'FR-908 441 729', country: 'France', countryCode: 'FR', flag: '🇫🇷', jurisdiction: 'Paris', entityType: 'Société par actions simplifiée', taxId: 'FR48908441729', address: '36 Rue du Louvre, 75001 Paris, France', website: 'frontierkinetic.example', registrationDate: '2021-07-12', industry: 'Aerospace', submittedAt: isoDaysAgo(5, 11), updatedAt: isoDaysAgo(0, 12), status: 'approved', riskScore: 19, riskLevel: 'low', reviewer: reviewers[0], wallet: { address: '0x4E18AA83240c862735EC0E08755F6695E51E4C80', network: 'Sepolia', provider: 'WalletConnect', connectedAt: isoDaysAgo(5,11), verified: true }, progress:100, progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','complete'],['Final Approval','complete']],ubos:[{id:'ubo-071',name:'Camille Laurent',initials:'CL',ownership:100,nationality:'French',kycStatus:'verified',wallet:'0x441F…78A3',risk:'low'}],directors:[{id:'dir-071',name:'Camille Laurent',initials:'CL',position:'Présidente',nationality:'French',email:'camille@frontierkinetic.example',phone:'+33 1 55 55 0178',kycStatus:'verified',risk:'low'}],risk:{overall:19,checks:[{label:'AML screening',result:'Clear',tone:'success',detail:'No matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'No matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'France'},{label:'Document authenticity',result:'97%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Clear',tone:'success',detail:'Single owner'}]},documents:commonDocuments('org-007',5).map(d=>({...d,status:'verified'})),notes:[],activity:[{id:'act-71',title:'Organization approved',description:'Final approval completed.',at:isoDaysAgo(0,12),tone:'success'}],
  },
  {
    id: 'org-008', logo: 'GM', name: 'Granite Meridian Trust', legalName: 'Granite Meridian Trust Company', registrationNumber: 'CH-020.3.045.991-2', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', jurisdiction: 'Zürich', entityType: 'Aktiengesellschaft', taxId: 'CHE-219.440.812', address: 'Bahnhofstrasse 61, 8001 Zürich, Switzerland', website: 'granitemeridian.example', registrationDate: '2017-08-29', industry: 'Asset Management', submittedAt: isoDaysAgo(6, 8), updatedAt: isoDaysAgo(2, 10), status: 'under_review', riskScore: 39, riskLevel: 'medium', reviewer: reviewers[2], wallet: { address: '0x7D84Fb2310c44191Cc4B551c432D2E9Ff47A550A', network: 'Sepolia', provider: 'MetaMask', connectedAt: isoDaysAgo(6,8), verified: true }, progress:79, progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','current'],['KYB Review','pending'],['Final Approval','pending']],ubos:[{id:'ubo-081',name:'Johannes Meier',initials:'JM',ownership:42,nationality:'Swiss',kycStatus:'verified',wallet:'0x841E…2A11',risk:'medium'},{id:'ubo-082',name:'Meridian Foundation',initials:'MF',ownership:35,nationality:'Liechtenstein',kycStatus:'review',wallet:'Not provided',risk:'medium'},{id:'ubo-083',name:'Anna Keller',initials:'AK',ownership:23,nationality:'Swiss',kycStatus:'verified',wallet:'0x119A…5B82',risk:'low'}],directors:[{id:'dir-081',name:'Johannes Meier',initials:'JM',position:'Chairman',nationality:'Swiss',email:'johannes@granitemeridian.example',phone:'+41 44 555 0198',kycStatus:'verified',risk:'medium'}],risk:{overall:39,checks:[{label:'AML screening',result:'Review',tone:'warning',detail:'Foundation screening'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'No matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'Switzerland'},{label:'Document authenticity',result:'93%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Complex',tone:'warning',detail:'Foundation ownership'}]},documents:commonDocuments('org-008',6),notes:[],activity:[{id:'act-81',title:'Enhanced review started',description:'Foundation ownership escalated for enhanced due diligence.',at:isoDaysAgo(2,10),tone:'warning'}],
  },
  {
    id: 'org-009', logo: 'HL', name: 'Helix Logistics BV', legalName: 'Helix Logistics B.V.', registrationNumber: 'KVK 81290417', country: 'Netherlands', countryCode: 'NL', flag: '🇳🇱', jurisdiction: 'Amsterdam', entityType: 'Besloten Vennootschap', taxId: 'NL862119408B01', address: 'Wibautstraat 131-D, 1091 GL Amsterdam', website: 'helixlogistics.example', registrationDate: '2020-12-02', industry: 'Logistics', submittedAt: isoDaysAgo(7, 12), updatedAt: isoDaysAgo(1, 14), status: 'pending', riskScore: 26, riskLevel: 'low', reviewer: null, wallet: { address: '0x4C5bF1b66D8b421e8F78c0e4A24Fe11Bb41B34A7', network: 'Sepolia', provider: 'WalletConnect', connectedAt: isoDaysAgo(7,12), verified: true }, progress:86,progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','current'],['Final Approval','pending']],ubos:[{id:'ubo-091',name:'Sven de Vries',initials:'SV',ownership:75,nationality:'Dutch',kycStatus:'verified',wallet:'0xB40A…17FC',risk:'low'},{id:'ubo-092',name:'Mila Jansen',initials:'MJ',ownership:25,nationality:'Dutch',kycStatus:'verified',wallet:'0x47C9…18A0',risk:'low'}],directors:[{id:'dir-091',name:'Sven de Vries',initials:'SV',position:'Managing Director',nationality:'Dutch',email:'sven@helixlogistics.example',phone:'+31 20 555 0138',kycStatus:'verified',risk:'low'}],risk:{overall:26,checks:[{label:'AML screening',result:'Clear',tone:'success',detail:'No matches'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'No matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'Netherlands'},{label:'Document authenticity',result:'95%',tone:'info',detail:'Machine confidence'},{label:'Ownership structure',result:'Clear',tone:'success',detail:'Direct ownership'}]},documents:commonDocuments('org-009',7),notes:[],activity:[{id:'act-91',title:'Organization submitted',description:'Application entered review.',at:isoDaysAgo(7,12),tone:'info'}],
  },
  {
    id: 'org-010', logo: 'IV', name: 'Ion Venture Studio Inc.', legalName: 'Ion Venture Studio Inc.', registrationNumber: 'BC1389204', country: 'Canada', countryCode: 'CA', flag: '🇨🇦', jurisdiction: 'British Columbia', entityType: 'Corporation', taxId: '79281 4802 RC0001', address: '1285 West Pender Street, Vancouver, BC V6E 4B1', website: 'ionventure.example', registrationDate: '2022-10-06', industry: 'Venture Studio', submittedAt: isoDaysAgo(8, 15), updatedAt: isoDaysAgo(2, 9), status: 'rejected', riskScore: 58, riskLevel: 'high', reviewer: reviewers[3], wallet: { address: '0x9310C9f39bC54AAfAc8f007aB3D414914C93F75C', network: 'Sepolia', provider: 'MetaMask', connectedAt: isoDaysAgo(8,15), verified: true }, progress:80,progressSteps:[['Company Information','complete'],['Registration','complete'],['Directors','complete'],['UBO','complete'],['Wallet Connected','complete'],['Documents Uploaded','complete'],['AML Screening','complete'],['KYB Review','complete'],['Final Approval','rejected']],ubos:[{id:'ubo-101',name:'Mason Clarke',initials:'MC',ownership:51,nationality:'Canadian',kycStatus:'review',wallet:'0xA294…A101',risk:'high'},{id:'ubo-102',name:'Ion Nominee Corp.',initials:'IN',ownership:49,nationality:'Canada',kycStatus:'review',wallet:'Not provided',risk:'high'}],directors:[{id:'dir-101',name:'Mason Clarke',initials:'MC',position:'Chief Executive Officer',nationality:'Canadian',email:'mason@ionventure.example',phone:'+1 604 555 0182',kycStatus:'review',risk:'high'}],risk:{overall:58,checks:[{label:'AML screening',result:'Review',tone:'warning',detail:'Adverse media result'},{label:'Sanctions check',result:'Clear',tone:'success',detail:'No matches'},{label:'PEP check',result:'Clear',tone:'success',detail:'No matches'},{label:'Jurisdiction risk',result:'Low',tone:'success',detail:'Canada'},{label:'Document authenticity',result:'66%',tone:'danger',detail:'Alteration indicators'},{label:'Ownership structure',result:'Review',tone:'warning',detail:'Nominee shareholder'}]},documents:commonDocuments('org-010',8).map((d,i)=>i===0?{...d,status:'rejected'}:d),notes:[],activity:[{id:'act-101',title:'Organization rejected',description:'Certificate authenticity could not be confirmed.',at:isoDaysAgo(2,9),tone:'danger'}],rejectionReason:'Submitted incorporation certificate could not be authenticated.'
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultState = () => ({ organizations: clone(organizations), reviewers: clone(reviewers) });

const readState = () => {
  if (typeof window === 'undefined') return defaultState();
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored?.organizations)) return stored;
  } catch {
    // Ignore invalid development data and restore defaults.
  }
  const state = defaultState();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
};

const writeState = (state) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const appendActivity = (organization, title, description, tone = 'info') => ({
  ...organization,
  updatedAt: new Date().toISOString(),
  activity: [
    { id: `act-${Date.now()}`, title, description, tone, at: new Date().toISOString() },
    ...(organization.activity || []),
  ],
});

const updateOrganization = (organizationId, updater) => {
  const state = readState();
  const index = state.organizations.findIndex((item) => item.id === organizationId);
  if (index < 0) throw new Error('Organization was not found.');
  state.organizations[index] = updater(clone(state.organizations[index]));
  writeState(state);
  return clone(state.organizations[index]);
};

const normalize = (value) => String(value || '').trim().toLowerCase();

export const adminMockApi = {
  async getOverview() {
    await wait(320);
    const state = readState();
    const pending = state.organizations.filter((item) => ['pending', 'under_review'].includes(item.status));
    const today = new Date().toDateString();
    const changedToday = (status) =>
      state.organizations.filter(
        (item) => item.status === status && new Date(item.updatedAt).toDateString() === today,
      ).length;
    return {
      stats: {
        pending: pending.length,
        approvedToday: changedToday('approved'),
        rejectedToday: changedToday('rejected'),
        total: state.organizations.length,
      },
      queue: clone(pending.slice(0, 5)),
      activity: clone(
        state.organizations
          .flatMap((item) => (item.activity || []).map((activity) => ({ ...activity, organizationId: item.id, organizationName: item.name })))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 8),
      ),
      riskDistribution: {
        low: state.organizations.filter((item) => item.riskLevel === 'low').length,
        medium: state.organizations.filter((item) => item.riskLevel === 'medium').length,
        high: state.organizations.filter((item) => item.riskLevel === 'high').length,
      },
    };
  },

  async listOrganizations({
    page = 1,
    pageSize = 6,
    search = '',
    status = 'all',
    country = 'all',
    entityType = 'all',
    dateFrom = '',
    dateTo = '',
    sortBy = 'submittedAt',
    sortDirection = 'desc',
  } = {}) {
    await wait();
    const state = readState();
    const needle = normalize(search);
    let items = state.organizations.filter((item) => {
      const matchesSearch = !needle || normalize(`${item.name} ${item.legalName} ${item.registrationNumber} ${item.wallet?.address}`).includes(needle);
      const matchesStatus = status === 'all' || item.status === status;
      const matchesCountry = country === 'all' || item.country === country;
      const matchesEntity = entityType === 'all' || item.entityType === entityType;
      const submittedTime = new Date(item.submittedAt).getTime();
      const matchesFrom = !dateFrom || submittedTime >= new Date(`${dateFrom}T00:00:00`).getTime();
      const matchesTo = !dateTo || submittedTime <= new Date(`${dateTo}T23:59:59`).getTime();
      return matchesSearch && matchesStatus && matchesCountry && matchesEntity && matchesFrom && matchesTo;
    });
    items = items.sort((a, b) => {
      const left = sortBy.includes('At') ? new Date(a[sortBy]).getTime() : a[sortBy];
      const right = sortBy.includes('At') ? new Date(b[sortBy]).getTime() : b[sortBy];
      const result = left > right ? 1 : left < right ? -1 : 0;
      return sortDirection === 'asc' ? result : -result;
    });
    const start = (page - 1) * pageSize;
    return {
      items: clone(items.slice(start, start + pageSize)),
      meta: {
        page,
        pageSize,
        total: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
      },
      filters: {
        countries: [...new Set(state.organizations.map((item) => item.country))].sort(),
        entityTypes: [...new Set(state.organizations.map((item) => item.entityType))].sort(),
      },
    };
  },

  async getOrganization(organizationId) {
    await wait(360);
    const organization = readState().organizations.find((item) => item.id === organizationId);
    if (!organization) throw new Error('Organization was not found.');
    return clone(organization);
  },

  async approveOrganization(organizationId, payload = {}) {
    await wait(650);
    return updateOrganization(organizationId, (organization) => {
      const next = appendActivity(
        organization,
        'Organization approved',
        payload.comment || 'Final compliance approval completed. Token issuance is now eligible.',
        'success',
      );
      return { ...next, status: 'approved', progress: 100, approvedAt: new Date().toISOString(), rejectionReason: '', progressSteps: next.progressSteps.map(([label]) => [label, 'complete']) };
    });
  },

  async rejectOrganization(organizationId, payload) {
    await wait(650);
    return updateOrganization(organizationId, (organization) => {
      const next = appendActivity(
        organization,
        'Organization rejected',
        payload.comment || payload.reason || 'Application rejected by compliance review.',
        'danger',
      );
      return { ...next, status: 'rejected', rejectionReason: payload.reason, rejectedAt: new Date().toISOString(), progressSteps: next.progressSteps.map(([label, state]) => [label, label === 'Final Approval' ? 'rejected' : state]) };
    });
  },

  async requestInformation(organizationId, payload) {
    await wait(500);
    return updateOrganization(organizationId, (organization) => appendActivity(organization, 'More information requested', payload.message, 'warning'));
  },

  async assignReviewer(organizationId, reviewerId) {
    await wait(420);
    const reviewer = readState().reviewers.find((item) => item.id === reviewerId) || null;
    return updateOrganization(organizationId, (organization) => ({
      ...appendActivity(organization, 'Reviewer assigned', reviewer ? `${reviewer.name} assigned as primary reviewer.` : 'Reviewer assignment removed.', 'violet'),
      reviewer,
      status: organization.status === 'pending' && reviewer ? 'under_review' : organization.status,
    }));
  },

  async updateDocumentStatus(organizationId, documentId, status, note = '') {
    await wait(360);
    return updateOrganization(organizationId, (organization) => ({
      ...appendActivity(organization, `Document ${status}`, `${organization.documents.find((item) => item.id === documentId)?.name || 'Document'} marked ${status}.${note ? ` ${note}` : ''}`, status === 'verified' ? 'success' : 'danger'),
      documents: organization.documents.map((document) => document.id === documentId ? { ...document, status, reviewedAt: new Date().toISOString() } : document),
    }));
  },


  async downloadDocument(organizationId, documentId) {
    await wait(220);
    const organization = readState().organizations.find((item) => item.id === organizationId);
    const document = organization?.documents?.find((item) => item.id === documentId);
    if (!organization || !document) throw new Error('Document was not found.');
    return {
      blob: new Blob([
        `T-REX Capital Market development preview\n\nOrganization: ${organization.name}\nDocument: ${document.name}\nFile: ${document.fileName}\nStatus: ${document.status}\n`,
      ], { type: 'text/plain' }),
      fileName: `${document.fileName}.preview.txt`,
    };
  },

  async addNote(organizationId, payload) {
    await wait(300);
    return updateOrganization(organizationId, (organization) => ({
      ...appendActivity(organization, 'Internal note added', `${payload.author || 'Compliance reviewer'} added an internal note.`, 'info'),
      notes: [
        { id: `note-${Date.now()}`, author: payload.author || 'Compliance Admin', initials: payload.initials || 'CA', message: payload.message, createdAt: new Date().toISOString(), internal: true },
        ...(organization.notes || []),
      ],
    }));
  },

  async listReviewers() {
    await wait(220);
    return clone(readState().reviewers);
  },

  async listAuditLogs({ page = 1, pageSize = 12, search = '' } = {}) {
    await wait(360);
    const needle = normalize(search);
    const logs = readState().organizations
      .flatMap((organization) => (organization.activity || []).map((activity) => ({
        id: `${organization.id}-${activity.id}`,
        organizationId: organization.id,
        organizationName: organization.name,
        action: activity.title,
        description: activity.description,
        actor: organization.reviewer?.name || 'System automation',
        at: activity.at,
        tone: activity.tone,
        ipAddress: '192.0.2.42',
      })))
      .filter((log) => !needle || normalize(`${log.organizationName} ${log.action} ${log.actor}`).includes(needle))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const start = (page - 1) * pageSize;
    return { items: clone(logs.slice(start, start + pageSize)), meta: { page, pageSize, total: logs.length, totalPages: Math.max(1, Math.ceil(logs.length / pageSize)) } };
  },

  async listSecurityLogs() {
    await wait(300);
    return [
      { id: 'sec-1', event: 'Admin sign-in', actor: 'Maya Chen', location: 'London, UK', device: 'Chrome on macOS', at: isoDaysAgo(0, 8), status: 'success' },
      { id: 'sec-2', event: 'New API token created', actor: 'Liam Carter', location: 'New York, US', device: 'Safari on macOS', at: isoDaysAgo(1, 16), status: 'review' },
      { id: 'sec-3', event: 'Failed sign-in attempt', actor: 'Unknown user', location: 'Frankfurt, DE', device: 'Firefox on Linux', at: isoDaysAgo(2, 3), status: 'blocked' },
    ];
  },

  reset() {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  },
};
