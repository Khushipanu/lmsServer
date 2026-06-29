//store krega videos and image ko
import multer from "multer"
import {v4 as uuid} from "uuid"

//multiple users photo.jpg krke save kre toh overwrite na ho isliye uuid unique id for every uploaded photo
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')  //it ll be saved in this location
  },
  filename: function (req, file, cb) {
    const id=uuid();

    const extName=file.originalname.split(".").pop();  //original file ka extendsion like .png .mp4
    const fileName=`${id}.${extName}`
    cb(null,fileName)
  }
})
const uploadFiles = multer({ storage}).single("file")
export default uploadFiles;