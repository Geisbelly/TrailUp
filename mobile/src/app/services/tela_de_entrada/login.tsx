import {SafeAreaView,StyleSheet,Text,TextInput,View,TouchableOpacity} from 'react-native'

const Login = () =>{

    return(
        <SafeAreaView style = {style.container}>
         <View>
            <Text style={style.Text}>-TrailUp-</Text>
         </View>
         <View>
          <TextInput style ={style.Input}
          placeholder=' Número de telefone, email ou nome de usuário'/>
          <TextInput style ={style.Input}
          placeholder=' Senha'/>
         </View>
         <View>
            <TouchableOpacity style={style.button}>
                <Text style={style.buttonText}>Entrar</Text>
            </TouchableOpacity>
         </View>
         <View>
          <TouchableOpacity style={style.link}>
            <Text style={style.linkText}>Esqueceu a senha?Recuperar senha.</Text>
          </TouchableOpacity>
         </View>
        </SafeAreaView>
    )
}
const style = StyleSheet.create({
    container: {
    flex: 1,                   
    justifyContent: 'center',  
    alignItems: 'center',      
    backgroundColor: '#13112E',  
  },
   Text: {
    marginBottom: 20,
    marginTop: 20,
    fontSize: 40,
    fontFamily:"Inknut Antiqua",
    color:'#FFFFFF',
    
  },
  Input:{
    width:311,
    height:40,
    marginTop: 20,
    backgroundColor:'#5F5D79',
    color:'#ADADC1',
    fontSize: 13,
    borderRadius:4,
    paddingHorizontal: 15,
  },
  button: {
    width:311,
    height:40,
    backgroundColor: '#4C40F699',
    marginTop: 20,
    paddingVertical: 9,
    borderRadius: 4,
    alignItems: 'center',
   
  },
  buttonText:{
    fontSize:18,
    color:'#B9ADC1',
  },
  link:{
    marginTop:20,
    alignSelf: 'flex-start',
  },
  linkText:{
    fontSize:10,
    color:'#FBF5FF',
  }
})

export default Login;