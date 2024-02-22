type Customer ={
    Address:AddressType;
    CustomerCode:string;
    CustomerNumber:string;
    CollectionLocation: string,
    ContactPerson: string,  
    Email:string,
    Name: string
}
type AddressType = {
    AddressType: string;
    Area?: string;
    Buildingname?: string;
    City: string;
    CompanyName?: string;
    Countrycode: string;
    Department?: string;
    Doorcode?: string;
    FirstName?: string;
    Floor?: string;
    HouseNr?: string;
    HouseNrExt?: string;
    Name?: string;
    Region?: string;
    Street?: string;
    StreetHouseNrExt?: string;
    Zipcode?: string;
  };
  
  type AmountType = {
    AmountType: string;
    AccountName?: string;
    BIC?: string;
    Currency: string;
    IBAN?: string;
    Reference?: string;
    TransactionNumber?: string;
    Value: number;
  };
  
  type ContactType = {
    ContactType: string;
    Email?: string;
    SMSNr?: string;
    TelNr?: string;
  };
  
  type CustomsType = {
    Certificate?: boolean;
    CertificateNr?: string;
    License?: boolean;
    LicenseNr?: string;
    Invoice?: boolean;
    InvoiceNr?: string;
    ShipmentType: string;
    Currency: string;
    Content?:ContentDescription[],
    HandleAsNonDeliverable : boolean;
    TrustedShipperID?: string ,
    ImporterReferenceCode? : string
    
  };
  
  type DimensionType = {
    Height?: number;
    Length?: number;
    Volume?: number;
    Weight: any;
    Width?: number;
  };
  
  type ContentDescription = {
    Description?: string;
    Quantity?: any;
    Weight?: number;
    Value?: any;
    HSTariffNr?: string;
    CountryOfOrigin?: string;
    DeliveryAddress?: string;
    DeliveryDate?: string;
    Dimension?: DimensionType;
    DownPartnerBarcode?: string;
    DownPartnerID?: string;
    DownPartnerLocation?: string;
    Groups?: GroupType[];
    HazardousMaterial?: HazardousMaterialType[];
    PackagingGroupCode?: string;
    PackagingGroupDescription?: string;
    GrossWeight?: string;
    UNDGNumber?: string;
    TransportCategoryCode?: string;
    ChemicalTechnicalDescription?: string;
    ProductCodeCollect?: string;
    ProductCodeDelivery?: string;
    ProductOptions?: ProductOptionType[];
  };
  
  type GroupType = {
    GroupType: string;
    GroupSequence?: number;
    GroupCount?: number;
    MainBarcode: string;
  };
  
  type HazardousMaterialType = {
    ToxicSubstanceCode: string;
    AdditionalToxicSubstanceCode?: string[];
    ADRPoints?: string;
    TunnelCode?: string;
    PackagingGroupCode?: string;
    PackagingGroupDescription?: string;
    GrossWeight?: string;
    UNDGNumber?: string;
    TransportCategoryCode?: string;
    ChemicalTechnicalDescription?: string;
  };
  
  type ProductOptionType = {
    Characteristic: string;
    Option: string;
  };
  
  type ShipmentsType = {
    Addresses?: AddressType[];
    Amounts?: AmountType[];
    Barcode?: string;
    CodingText?: string;
    CollectionTimeStampStart?: string;
    CollectionTimeStampEnd?: string;
    Contacts?: ContactType[];
    
    CostCenter?: string;
    CustomerOrderNumber?: string;
    Customs?: CustomsType;
    HandleAsNonDeliverable?: boolean;
    Currency?: string;
    ShipmentType?: string;
    TrustedShipperID?: string;
    ImporterReferenceCode?: string;
    TransactionCode?: string;
    TransactionDescription?: string;
    Reference?: string;
    ReferenceCollect?: string;
    Remark?: string;
    ReturnBarcode?: string;
    ReturnReference?: string;
    TimeslotID?: string;
    ProductCodeDelivery?: string;
    Dimension?: DimensionType;
    // ... add other fields as needed
  };
  
  type MessageType = {
    MessageID: string;
    MessageTimeStamp: string;
    Printertype: string;
  };
  
 export type Data = {
    Shipments: ShipmentsType[];
    Message: MessageType;
    Customer: Customer;
  };
  