export type PostNLLabelResponse = {
    MergedLabels: string[];
    ResponseShipments: ResponseShipment[];
  };
  
  type ResponseShipment = {
    Barcode: string;
    Errors: Error[];
    Warnings: Warning[];
    Labels: Label[];
  };
  
  type Error = {
    Code: string;
    Description: string;
  };
  
  type Warning = {
    Code: string;
    Description: string;
  };
  
  type Label = {
    Content: string;
  };